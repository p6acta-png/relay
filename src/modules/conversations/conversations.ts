import 'server-only';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import type { Channel, ConversationStatus, MessageAuthor } from '@/generated/prisma/enums';
import type { TenantScope } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { generateToken, hashToken } from '@/lib/tokens';
import { recordAudit } from '@/modules/audit/audit';
import { domainEvent, type HandoffReason, type WithEvents } from '@/modules/events';
import { queueEmail } from '@/modules/notifications/email';
import { actorOf, authorizeIn, type ActorContext, type MemberContext } from '@/modules/tenancy/context';
import { IDLE_STATE, replyBlocksSchema, type AssistantState, type ReplyBlock } from './model';

// ─── Creating conversations and messages ────────────────────────────────────

export async function createConversation(
  { db, organizationId }: TenantScope,
  params: { channel: Channel; subject?: string | null; customerId?: string | null },
) {
  const token = generateToken();
  const conversation = await db.conversation.create({
    data: {
      organizationId,
      channel: params.channel,
      subject: params.subject ?? null,
      customerId: params.customerId ?? null,
      accessTokenHash: hashToken(token),
      state: IDLE_STATE,
    },
  });
  const event = domainEvent({
    type: 'conversation.started',
    organizationId,
    conversationId: conversation.id,
    customerId: conversation.customerId,
    channel: params.channel,
  });
  return { conversation, token, events: [event] };
}

/** Finds a conversation from the id and secret token held by the customer's browser. */
export async function findConversationForCustomer(
  { db, organizationId }: TenantScope,
  conversationId: string,
  token: string,
) {
  if (!z.uuid().safeParse(conversationId).success || !token || token.length > 100) return null;
  return db.conversation.findFirst({
    where: { id: conversationId, organizationId, accessTokenHash: hashToken(token) },
    include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
  });
}

export async function addMessage(
  { db, organizationId }: TenantScope,
  params: {
    conversationId: string;
    author: MessageAuthor;
    body: string;
    blocks?: ReplyBlock[];
    understanding?: unknown;
    staffMembershipId?: string | null;
  },
) {
  const blocks = params.blocks?.length ? replyBlocksSchema.parse(params.blocks) : undefined;
  // PostgreSQL's now() is the *transaction* start time, so several messages written in one
  // transaction would share a timestamp. Give each message a strictly later time than the last,
  // which keeps the transcript in order and makes "messages since X" polling exact.
  // FOR UPDATE serialises writers (customer, staff, automations) within one conversation.
  const [row] = await db.$queryRaw<{ lastMessageAt: Date }[]>`
    SELECT "lastMessageAt" FROM "Conversation"
    WHERE id = ${params.conversationId}::uuid AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE`;
  if (!row) throw new AppError('NOT_FOUND', 'Conversation not found.');
  const createdAt = new Date(Math.max(Date.now(), row.lastMessageAt.getTime() + 1));
  const message = await db.message.create({
    data: {
      organizationId,
      createdAt,
      conversationId: params.conversationId,
      author: params.author,
      body: params.body.slice(0, 4000),
      blocks: blocks ?? Prisma.DbNull,
      understanding:
        params.understanding === undefined ? Prisma.DbNull : (params.understanding as Prisma.InputJsonValue),
      staffMembershipId: params.staffMembershipId ?? null,
    },
  });
  await db.conversation.update({
    where: { id: params.conversationId },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}

/** What the customer's browser may see: no internal interpretation, no staff identities beyond a first name. */
export function toPublicMessage(message: {
  id: string;
  author: MessageAuthor;
  body: string;
  blocks: unknown;
  createdAt: Date;
  staffAuthor?: { user: { name: string } } | null;
}) {
  const blocks = replyBlocksSchema.safeParse(message.blocks ?? []);
  return {
    id: message.id,
    author: message.author,
    authorName: message.author === 'STAFF' ? (message.staffAuthor?.user.name.split(' ')[0] ?? 'Staff') : null,
    body: message.body,
    blocks: blocks.success ? blocks.data : [],
    createdAt: message.createdAt.toISOString(),
  };
}

export type PublicMessage = ReturnType<typeof toPublicMessage>;

// ─── Hand-off to a person ───────────────────────────────────────────────────

// #region learn:handoff
export async function handOffConversation(
  scope: TenantScope,
  ctx: ActorContext,
  params: { conversationId: string; reason: HandoffReason },
): Promise<WithEvents<null>> {
  authorizeIn(scope, ctx, 'conversations.handoff');
  const conversation = await scope.db.conversation.findFirst({
    where: { id: params.conversationId, organizationId: scope.organizationId },
  });
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found.');
  if (conversation.status === 'NEEDS_HUMAN' && !conversation.assistantActive)
    return { result: null, events: [] };

  await scope.db.conversation.update({
    where: { id: conversation.id },
    data: {
      status: 'NEEDS_HUMAN',
      assistantActive: false,
      handedOffAt: conversation.handedOffAt ?? new Date(),
      flaggedReason:
        params.reason === 'flagged' ? (conversation.flaggedReason ?? 'flagged') : conversation.flaggedReason,
    },
  });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'conversation.handed_off',
    entityType: 'Conversation',
    entityId: conversation.id,
    metadata: { reason: params.reason },
  });
  return {
    result: null,
    events: [
      domainEvent({
        type: 'conversation.handed_off',
        organizationId: scope.organizationId,
        conversationId: conversation.id,
        customerId: conversation.customerId,
        channel: conversation.channel,
        reason: params.reason,
      }),
    ],
  };
}
// #endregion learn:handoff

// ─── Staff inbox ────────────────────────────────────────────────────────────

export type InboxFilter = 'needs_human' | 'open' | 'resolved' | 'all';

export async function listConversations(
  scope: TenantScope,
  ctx: ActorContext,
  filter: InboxFilter,
  take = 60,
) {
  authorizeIn(scope, ctx, 'inbox.view');
  const status: Record<InboxFilter, ConversationStatus[] | undefined> = {
    needs_human: ['NEEDS_HUMAN'],
    open: ['OPEN'],
    resolved: ['RESOLVED'],
    all: undefined,
  };
  return scope.db.conversation.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(status[filter] ? { status: { in: status[filter] } } : {}),
      messages: { some: { author: 'CUSTOMER' } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take,
    include: {
      customer: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, user: { select: { name: true } } } },
      // Latest few customer messages; the list shows the one that says what they need.
      messages: {
        where: { author: 'CUSTOMER' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { body: true },
      },
      _count: { select: { bookings: true, leads: true } },
    },
  });
}

export async function countByStatus(scope: TenantScope) {
  const rows = await scope.db.conversation.groupBy({
    by: ['status'],
    where: { organizationId: scope.organizationId, messages: { some: { author: 'CUSTOMER' } } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<ConversationStatus, number>
  >;
}

export async function getConversationDetail(scope: TenantScope, ctx: ActorContext, conversationId: string) {
  authorizeIn(scope, ctx, 'inbox.view');
  const conversation = await scope.db.conversation.findFirst({
    where: { id: conversationId, organizationId: scope.organizationId },
    include: {
      customer: true,
      assignee: { select: { id: true, user: { select: { name: true } } } },
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 300,
        include: { staffAuthor: { select: { user: { select: { name: true } } } } },
      },
      bookings: { orderBy: { startsAt: 'desc' }, include: { service: { select: { name: true } } } },
      leads: { orderBy: { createdAt: 'desc' }, include: { service: { select: { name: true } } } },
      tasks: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found.');
  return conversation;
}

export const staffReplySchema = z.object({
  body: z.string().trim().min(1, 'Write a reply first.').max(4000),
});

// #region learn:staff-reply
export async function replyAsStaff(
  scope: TenantScope,
  ctx: MemberContext,
  params: { conversationId: string; body: string },
) {
  authorizeIn(scope, ctx, 'inbox.reply');
  const { body } = staffReplySchema.parse({ body: params.body });
  const conversation = await scope.db.conversation.findFirst({
    where: { id: params.conversationId, organizationId: scope.organizationId },
    include: { customer: { select: { email: true } }, organization: { select: { name: true, slug: true } } },
  });
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found.');

  const message = await addMessage(scope, {
    conversationId: conversation.id,
    author: 'STAFF',
    body,
    staffMembershipId: ctx.membershipId,
  });
  // A person has stepped in: Relay stops answering automatically until someone hands it back.
  await scope.db.conversation.update({
    where: { id: conversation.id },
    data: {
      assistantActive: false,
      state: { step: 'handed_off' } satisfies AssistantState,
      firstStaffReplyAt: conversation.firstStaffReplyAt ?? message.createdAt,
      status: conversation.status === 'RESOLVED' ? 'OPEN' : conversation.status,
    },
  });

  // Customers may have closed the chat, so a copy goes to their email when we have one.
  let emailed = false;
  if (conversation.customer?.email) {
    await queueEmail(scope, {
      to: conversation.customer.email,
      subject:
        conversation.channel === 'EMAIL' && conversation.subject
          ? `Re: ${conversation.subject}`
          : `${conversation.organization.name} replied to your message`,
      text: `${body}\n\n— ${ctx.name.split(' ')[0]}, ${conversation.organization.name}`,
      related: { type: 'Conversation', id: conversation.id },
    });
    emailed = true;
  }
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'conversation.staff_replied',
    entityType: 'Conversation',
    entityId: conversation.id,
    metadata: { emailed },
  });
  return { message, emailed };
}
// #endregion learn:staff-reply

export async function setConversationStatus(
  scope: TenantScope,
  ctx: MemberContext,
  conversationId: string,
  action: 'resolve' | 'reopen' | 'take_over' | 'hand_back',
) {
  authorizeIn(scope, ctx, 'inbox.reply');
  const conversation = await scope.db.conversation.findFirst({
    where: { id: conversationId, organizationId: scope.organizationId },
  });
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found.');

  const data: Prisma.ConversationUpdateInput = {
    resolve: { status: 'RESOLVED' as const, resolvedAt: new Date() },
    reopen: { status: 'NEEDS_HUMAN' as const, resolvedAt: null },
    take_over: { assistantActive: false, status: 'NEEDS_HUMAN' as const, state: { step: 'handed_off' } },
    hand_back: { assistantActive: true, status: 'OPEN' as const, state: IDLE_STATE },
  }[action];
  await scope.db.conversation.update({ where: { id: conversation.id }, data });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: `conversation.${action}`,
    entityType: 'Conversation',
    entityId: conversation.id,
    metadata: { from: conversation.status },
  });
}

export async function assignConversation(
  scope: TenantScope,
  ctx: ActorContext,
  conversationId: string,
  membershipId: string | null,
) {
  authorizeIn(scope, ctx, 'inbox.assign');
  if (membershipId) {
    const member = await scope.db.membership.findFirst({
      where: { id: membershipId, organizationId: scope.organizationId },
    });
    if (!member) throw new AppError('NOT_FOUND', 'Team member not found.');
  }
  const { count } = await scope.db.conversation.updateMany({
    where: { id: conversationId, organizationId: scope.organizationId },
    data: { assigneeId: membershipId },
  });
  if (count === 0) throw new AppError('NOT_FOUND', 'Conversation not found.');
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'conversation.assigned',
    entityType: 'Conversation',
    entityId: conversationId,
    metadata: { membershipId },
  });
}
