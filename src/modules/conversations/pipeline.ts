import 'server-only';
import { type Prisma } from '@/generated/prisma/client';
import { withTenant, type TenantScope } from '@/lib/db';
import { env } from '@/lib/env';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { addDays, formatInZone, localMinutesOfDay, toLocalDate } from '@/lib/time';
import type { TimePreference } from '@/modules/assistant/interpretation';
import { understand, type Understanding } from '@/modules/assistant/provider';
import { runAutomations } from '@/modules/automations/engine';
import { describeOpeningHours, parseOpeningHours } from '@/modules/catalog/opening-hours';
import { createLead } from '@/modules/crm/leads';
import { upsertCustomer } from '@/modules/customers/customers';
import type { DomainEvent } from '@/modules/events';
import { enforceChallenge, type ChallengeInput } from '@/modules/protection/challenge';
import { enforceRateLimit, RATE_LIMITS, rateLimitSubject } from '@/modules/protection/rate-limit';
import { assessMessage } from '@/modules/protection/spam';
import { findSlotsForService } from '@/modules/scheduling/availability';
import { createBooking } from '@/modules/scheduling/bookings';
import type { AssistantContext } from '@/modules/tenancy/context';
import { getPublicOrganization } from '@/modules/tenancy/organizations';
import {
  addMessage,
  createConversation,
  findConversationForCustomer,
  handOffConversation,
  toPublicMessage,
  type PublicMessage,
} from './conversations';
import { runFlow, welcomeReply, type FlowBusiness, type FlowPorts } from './flow';
import {
  customerInputSchema,
  parseState,
  type AssistantState,
  type Contact,
  type CustomerInput,
} from './model';

/**
 * The chat pipeline — one customer message, start to finish:
 *
 *   protect → identify business → understand → decide → act → persist → react → respond
 *
 * Understanding happens *outside* the database transaction: a real AI call can take seconds,
 * and a transaction must never be held open while waiting on a network. The write transaction
 * then locks the conversation row, so two messages sent at once are processed one at a time.
 */

export interface ChatRequest {
  slug: string;
  ip: string;
  conversationId: string | null;
  token: string | null;
  input: unknown;
  challenge?: ChallengeInput;
}

export interface ChatResponse {
  conversationId: string;
  /** Only returned when a conversation is created; the browser keeps it to continue later. */
  token?: string;
  messages: PublicMessage[];
  assistantActive: boolean;
  /** Shown once and never stored in messages (only the email and the customer's screen get it). */
  manageUrl?: string;
}

const PART_OF_DAY_WINDOWS = {
  morning: { startMinute: 0, endMinute: 12 * 60 },
  afternoon: { startMinute: 12 * 60, endMinute: 17 * 60 },
  evening: { startMinute: 16 * 60, endMinute: 24 * 60 },
} as const;

// #region learn:handle-chat-input
export async function handleChatInput(request: ChatRequest): Promise<ChatResponse> {
  // ── 1. Protect: validate the input and apply rate limits before any real work.
  const parsedInput = customerInputSchema.safeParse(request.input);
  if (!parsedInput.success) {
    throw new AppError(
      'VALIDATION',
      'That message could not be sent.',
      fieldErrorsFrom(parsedInput.error.issues),
    );
  }
  const input = parsedInput.data;
  const ipSubject = rateLimitSubject(request.ip);
  await enforceRateLimit(RATE_LIMITS.chatMessageByIp, ipSubject);

  const isNew = !request.conversationId;
  if (isNew) {
    enforceChallenge(request.challenge ?? {});
    await enforceRateLimit(RATE_LIMITS.conversationStartByIp, ipSubject);
  } else {
    await enforceRateLimit(RATE_LIMITS.chatMessageByConversation, request.conversationId!);
  }

  // ── 2. Identify the business from the public URL — never from anything in the request body.
  const organization = await getPublicOrganization(request.slug);
  if (!organization) throw new AppError('NOT_FOUND', 'This business could not be found.');

  // ── 3. Read what we need to understand the message (short read-only transaction).
  const snapshot = await withTenant(organization.id, async (scope) => {
    const business = await loadBusiness(scope);
    if (isNew) return { business, state: parseState(null), recent: [] as string[], assistantActive: true };
    const conversation = await findConversationForCustomer(
      scope,
      request.conversationId!,
      request.token ?? '',
    );
    if (!conversation)
      throw new AppError('NOT_FOUND', 'This conversation has ended. Please start a new one.');
    const recent = await scope.db.message.findMany({
      where: { organizationId: scope.organizationId, conversationId: conversation.id, author: 'CUSTOMER' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { body: true },
    });
    return {
      business,
      state: parseState(conversation.state),
      recent: recent.map((m) => m.body),
      assistantActive: conversation.assistantActive,
    };
  });

  // ── 4. Understand (outside any transaction). Only free text needs interpretation.
  let understanding: Understanding | null = null;
  if (input.kind === 'text' && snapshot.assistantActive) {
    understanding = await understand({
      message: input.text,
      localNow: {
        date: toLocalDate(new Date(), snapshot.business.flow.timeZone),
        minute: localMinutesOfDay(new Date(), snapshot.business.flow.timeZone),
      },
      step: snapshot.state.step,
      services: snapshot.business.catalog.services,
      knowledge: snapshot.business.catalog.knowledge,
    });
  }

  // ── 5–7. Decide, act and persist — all in one transaction.
  const events: DomainEvent[] = [];
  let manageUrl: string | undefined;

  const outcome = await withTenant(organization.id, async (scope) => {
    let conversationId = request.conversationId;
    let token: string | undefined;

    if (isNew) {
      const created = await createConversation(scope, { channel: 'WEB_CHAT' });
      conversationId = created.conversation.id;
      token = created.token;
      events.push(...created.events);
      const welcome = welcomeReply(snapshot.business.flow);
      await addMessage(scope, {
        conversationId,
        author: 'ASSISTANT',
        body: welcome.body,
        blocks: welcome.blocks,
      });
    } else {
      // Serialize concurrent messages in the same conversation.
      await scope.db.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId}::uuid FOR UPDATE`;
    }

    const conversation = await scope.db.conversation.findFirstOrThrow({
      where: { id: conversationId!, organizationId: scope.organizationId },
      include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    });
    const state = parseState(conversation.state);

    const customerMessage = await addMessage(scope, {
      conversationId: conversation.id,
      author: 'CUSTOMER',
      body: describeInput(input, state, snapshot.business.flow),
      understanding: understanding
        ? {
            ...understanding.interpretation,
            provider: understanding.provider,
            rejected: understanding.rejected ?? null,
          }
        : undefined,
    });

    const assistant: AssistantContext = {
      kind: 'assistant',
      organizationId: scope.organizationId,
      conversationId: conversation.id,
    };

    // Abuse signals: store the message, but let a person handle the conversation from here.
    if (input.kind === 'text') {
      const verdict = assessMessage(input.text, snapshot.recent);
      if (verdict.flagged && conversation.assistantActive) {
        await scope.db.conversation.update({
          where: { id: conversation.id },
          data: { flaggedReason: verdict.reasons.join(',') },
        });
        const handoff = await handOffConversation(scope, assistant, {
          conversationId: conversation.id,
          reason: 'flagged',
        });
        events.push(...handoff.events);
        await addMessage(scope, {
          conversationId: conversation.id,
          author: 'ASSISTANT',
          body: 'Thanks for your message. Someone from the team will look at it.',
        });
        return {
          conversationId: conversation.id,
          token,
          after: customerMessage.createdAt,
          assistantActive: false,
        };
      }
    }

    const acceptingContactAfterHandoff = state.step === 'handoff.contact' && input.kind === 'submit_details';
    if (!conversation.assistantActive && !acceptingContactAfterHandoff) {
      // A person is handling this conversation; Relay stays quiet.
      if (conversation.status === 'RESOLVED') {
        await scope.db.conversation.update({
          where: { id: conversation.id },
          data: { status: 'NEEDS_HUMAN', resolvedAt: null },
        });
      }
      return {
        conversationId: conversation.id,
        token,
        after: customerMessage.createdAt,
        assistantActive: false,
      };
    }

    let known: Partial<Contact> | null = conversation.customer
      ? {
          name: conversation.customer.name ?? undefined,
          email: conversation.customer.email ?? undefined,
          phone: conversation.customer.phone ?? undefined,
        }
      : null;

    // Ports: the only way the flow can change anything — each call goes through a real service
    // with the assistant's limited permissions and full validation.
    const ports: FlowPorts = {
      findSlots: (params) => searchSlots(scope, snapshot.business.flow.timeZone, params),
      async createBooking({ serviceId, slot, contact }) {
        try {
          const { result, events: bookingEvents } = await createBooking(scope, assistant, {
            serviceId,
            startsAt: slot.startsAt,
            customer: { name: contact.name, email: contact.email, phone: contact.phone ?? '' },
            origin: 'CHAT',
            conversationId: conversation.id,
          });
          events.push(...bookingEvents);
          manageUrl = `${env.APP_URL}/w/${organization.slug}/booking/${result.manageToken}`;
          return {
            ok: true,
            reference: result.booking.reference,
            status: result.booking.status as 'CONFIRMED' | 'PENDING',
          };
        } catch (error) {
          if (error instanceof AppError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) {
            return {
              ok: false,
              reason: 'taken',
              message: 'that time was just taken. Here are other free times:',
            };
          }
          if (error instanceof AppError && error.code === 'VALIDATION') {
            return {
              ok: false,
              reason: 'invalid',
              message: 'something in the booking details didn’t look right. Please pick a time again:',
            };
          }
          throw error;
        }
      },
      async createLead({ serviceId, description, contact }) {
        const { events: leadEvents } = await createLead(scope, assistant, {
          customer: { name: contact.name, email: contact.email, phone: contact.phone ?? '' },
          serviceId,
          summary: description,
          origin: 'CHAT',
          conversationId: conversation.id,
        });
        events.push(...leadEvents);
      },
      async handOff(reason) {
        const handoff = await handOffConversation(scope, assistant, {
          conversationId: conversation.id,
          reason,
        });
        events.push(...handoff.events);
      },
      async attachContact(contact) {
        const { customer } = await upsertCustomer(scope, {
          name: contact.name,
          email: contact.email,
          phone: contact.phone ?? '',
        });
        await scope.db.conversation.update({
          where: { id: conversation.id },
          data: { customerId: customer.id },
        });
        known = {
          name: customer.name ?? undefined,
          email: customer.email ?? undefined,
          phone: customer.phone ?? undefined,
        };
      },
      knownContact: () => known,
    };

    const result = await runFlow(
      state,
      input,
      understanding?.interpretation ?? null,
      snapshot.business.flow,
      ports,
    );

    for (const reply of result.replies) {
      await addMessage(scope, {
        conversationId: conversation.id,
        author: 'ASSISTANT',
        body: reply.body,
        blocks: reply.blocks,
      });
    }
    const latest = await scope.db.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    await scope.db.conversation.update({
      where: { id: conversation.id },
      data: {
        state: result.state as Prisma.InputJsonValue,
        hadBookingIntent: latest.hadBookingIntent || result.bookingIntent,
        status: latest.status === 'RESOLVED' ? 'OPEN' : latest.status,
      },
    });

    return {
      conversationId: conversation.id,
      token,
      after: customerMessage.createdAt,
      assistantActive: latest.assistantActive,
    };
  });

  // ── 8. React: automations run only after the transaction has committed.
  await runAutomations(events);

  // ── 9. Respond with everything new since the customer's message (including automation replies).
  // A new conversation also returns the welcome message it was created with.
  const messages = await listPublicMessages(
    organization.id,
    outcome.conversationId,
    isNew ? undefined : outcome.after,
    true,
  );
  return {
    conversationId: outcome.conversationId,
    token: outcome.token,
    messages,
    assistantActive: outcome.assistantActive,
    manageUrl,
  };
}
// #endregion learn:handle-chat-input

/** Messages for the customer's browser, optionally only those at/after a point in time. */
export async function listPublicMessages(
  organizationId: string,
  conversationId: string,
  after?: Date,
  inclusive = false,
) {
  return withTenant(organizationId, async ({ db }) => {
    const messages = await db.message.findMany({
      where: {
        organizationId,
        conversationId,
        ...(after ? { createdAt: inclusive ? { gte: after } : { gt: after } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { staffAuthor: { select: { user: { select: { name: true } } } } },
    });
    return messages.map(toPublicMessage);
  });
}

/** Polling endpoint for the widget: new messages (e.g. a staff reply) since a message id. */
export async function pollConversation(params: {
  slug: string;
  conversationId: string;
  token: string;
  afterId?: string | null;
}) {
  const organization = await getPublicOrganization(params.slug);
  if (!organization) throw new AppError('NOT_FOUND', 'This business could not be found.');
  const found = await withTenant(organization.id, async (scope) => {
    const conversation = await findConversationForCustomer(scope, params.conversationId, params.token);
    if (!conversation) return null;
    const cursor = params.afterId
      ? await scope.db.message.findFirst({
          where: {
            id: params.afterId,
            conversationId: conversation.id,
            organizationId: scope.organizationId,
          },
          select: { createdAt: true },
        })
      : null;
    return { conversation, cursor };
  });
  if (!found) throw new AppError('NOT_FOUND', 'This conversation has ended. Please start a new one.');
  const messages = await listPublicMessages(organization.id, found.conversation.id, found.cursor?.createdAt);
  return { messages, assistantActive: found.conversation.assistantActive, status: found.conversation.status };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadBusiness(scope: TenantScope) {
  const { db, organizationId } = scope;
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const services = await db.service.findMany({
    where: { organizationId, active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const knowledge = await db.knowledgeItem.findMany({
    where: { organizationId, published: true },
    orderBy: { sortOrder: 'asc' },
  });

  const flow: FlowBusiness = {
    name: organization.name,
    timeZone: organization.timezone,
    openingHoursLines: describeOpeningHours(parseOpeningHours(organization.openingHours)),
    address: [organization.addressLine, organization.city].filter(Boolean).join(', ') || null,
    contactEmail: organization.contactEmail,
    contactPhone: organization.contactPhone,
    handoffReplyHours: organization.handoffReplyHours,
    cancellationWindowHours: organization.cancellationWindowHours,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceMinor: s.priceMinor,
      priceIsFrom: s.priceIsFrom,
      confirmationMode: s.confirmationMode,
    })),
    knowledge: knowledge.map((k) => ({ id: k.id, question: k.question, answer: k.answer })),
  };
  // The provider sees only the public catalogue: names and keywords, no prices or customer data.
  const catalog = {
    services: services.map((s) => ({ id: s.id, name: s.name, kind: s.kind, keywords: s.keywords })),
    knowledge: knowledge.map((k) => ({ id: k.id, question: k.question, keywords: k.keywords })),
  };
  return { flow, catalog };
}

/** Turns a customer's preference into slot searches, widening the search when nothing fits. */
async function searchSlots(
  scope: TenantScope,
  timeZone: string,
  params: { serviceId: string; time: TimePreference | null; searchFrom: string | null },
) {
  const today = toLocalDate(new Date(), timeZone);
  const find = async (from: string, to: string, window?: { startMinute: number; endMinute: number }) =>
    (await findSlotsForService(scope, { serviceId: params.serviceId, from, to, window })).slots;

  const { time, searchFrom } = params;
  if (searchFrom) return { slots: await find(searchFrom, addDays(searchFrom, 6)), matchedPreference: true };

  const window =
    time?.exactMinute != null
      ? { startMinute: Math.max(0, time.exactMinute - 60), endMinute: Math.min(1440, time.exactMinute + 121) }
      : time?.partOfDay
        ? PART_OF_DAY_WINDOWS[time.partOfDay]
        : undefined;

  const from = time?.dateFrom ?? today;
  const to = time?.dateTo ?? (time?.dateFrom ? time.dateFrom : addDays(today, 6));
  let slots = await find(from, to, window);
  if (slots.length > 0) {
    if (time?.exactMinute != null) {
      const target = time.exactMinute;
      slots = [...slots].sort(
        (a, b) =>
          Math.abs(localMinutesOfDay(a.startsAt, timeZone) - target) -
          Math.abs(localMinutesOfDay(b.startsAt, timeZone) - target),
      );
    }
    return { slots, matchedPreference: Boolean(time) };
  }
  // Nothing matched: widen to the next two weeks from the requested day, any time of day.
  slots = await find(from, addDays(from, 13));
  return { slots, matchedPreference: !time };
}

/** How a structured action appears in the transcript (never echoes contact details). */
function describeInput(input: CustomerInput, state: AssistantState, business: FlowBusiness): string {
  switch (input.kind) {
    case 'text':
      return input.text;
    case 'choose_service':
      return business.services.find((s) => s.id === input.serviceId)?.name ?? 'Chose a service';
    case 'choose_slot': {
      const slot =
        state.step === 'booking.slot' ? state.offered.find((s) => s.id === input.slotId) : undefined;
      return slot
        ? formatInZone(new Date(slot.startsAt), business.timeZone, "EEEE d MMMM 'at' HH:mm")
        : 'Chose a time';
    }
    case 'more_times':
      return 'Show me more times';
    case 'submit_details':
      return 'Shared contact details';
    case 'confirm_booking':
      return 'Confirm';
    case 'change_time':
      return 'Choose another time';
    case 'talk_to_human':
      return 'I’d like to talk to a person';
    case 'start_over':
      return 'Start over';
  }
}

export function logPipelineError(error: unknown, context: Record<string, unknown>) {
  logger.error('chat.pipeline_failed', { ...context, error });
}
