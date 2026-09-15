import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@/lib/db';
import { runAutomations } from '@/modules/automations/engine';
import { replyAsStaff } from '@/modules/conversations/conversations';
import type { ReplyBlock } from '@/modules/conversations/model';
import { handleChatInput, pollConversation } from '@/modules/conversations/pipeline';
import { domainEvent } from '@/modules/events';
import { demoChallengeProvider } from '@/modules/protection/challenge';
import { resetDatabase } from '../support/database';
import { createBusiness } from '../support/factories';

async function setupWorkshop() {
  const business = await createBusiness({ businessName: 'Chat Test Bikes' });
  const { organization } = business;
  const extra = await withTenant(organization.id, async ({ db, organizationId }) => {
    const owner = await db.staffMember.findFirstOrThrow({ where: { organizationId } });
    const standard = await db.service.findFirstOrThrow({ where: { organizationId } });
    await db.service.update({ where: { id: standard.id }, data: { keywords: ['service', 'servicing'] } });
    const overhaul = await db.service.create({
      data: { organizationId, name: 'Full overhaul', kind: 'QUOTE', keywords: ['overhaul', 'rebuild'] },
    });
    const ebike = await db.service.create({
      data: {
        organizationId,
        name: 'E-bike diagnostics',
        durationMinutes: 45,
        confirmationMode: 'APPROVAL',
        keywords: ['e-bike', 'ebike', 'motor'],
      },
    });
    await db.staffService.create({ data: { organizationId, staffMemberId: owner.id, serviceId: ebike.id } });
    await db.knowledgeItem.create({
      data: {
        organizationId,
        question: 'Do you give a warranty on repairs?',
        answer: 'Yes — three months on all workshop labour.',
        keywords: ['warranty', 'guarantee'],
      },
    });
    return { standard, overhaul, ebike };
  });
  return { ...business, ...extra };
}

/** A customer session: keeps the conversation id and token like the browser widget does. */
function customerSession(slug: string) {
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}-${randomUUID()}`;
  let conversationId: string | null = null;
  let token: string | null = null;
  return {
    get conversationId() {
      return conversationId;
    },
    get token() {
      return token;
    },
    async send(input: unknown) {
      const response = await handleChatInput({
        slug,
        ip,
        conversationId,
        token,
        input,
        challenge: { formToken: demoChallengeProvider.issue(new Date(Date.now() - 5_000)).formToken },
      });
      conversationId = response.conversationId;
      token = response.token ?? token;
      return response;
    },
  };
}

const lastBlocks = (response: { messages: { author: string; blocks: ReplyBlock[] }[] }) =>
  response.messages.filter((m) => m.author === 'ASSISTANT').at(-1)?.blocks ?? [];
const block = <T extends ReplyBlock['type']>(blocks: ReplyBlock[], type: T) =>
  blocks.find((b): b is Extract<ReplyBlock, { type: T }> => b.type === type);

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('demo scenario 1: a customer books through the chat', () => {
  it('goes from a plain-English request to a confirmed, audited booking', async () => {
    const { organization } = await setupWorkshop();
    const customer = customerSession(organization.slug);

    const first = await customer.send({
      kind: 'text',
      text: 'Hi, can I book a service next Tuesday afternoon?',
    });
    expect(first.token).toBeTruthy();
    expect(first.messages.map((m) => m.author)).toEqual(['ASSISTANT', 'CUSTOMER', 'ASSISTANT']);
    const slots = block(lastBlocks(first), 'slot_options');
    expect(slots?.days[0]?.slots.length).toBeGreaterThan(0);
    expect(Number(slots!.days[0]!.slots[0]!.time.slice(0, 2))).toBeGreaterThanOrEqual(12);

    const chosen = await customer.send({ kind: 'choose_slot', slotId: slots!.days[0]!.slots[0]!.id });
    expect(block(lastBlocks(chosen), 'details_form')?.purpose).toBe('booking');

    const invalid = await customer.send({ kind: 'submit_details', name: 'Kari', email: 'not-an-email' });
    expect(block(lastBlocks(invalid), 'details_form')?.errors?.email).toBeTruthy();

    const details = await customer.send({
      kind: 'submit_details',
      name: 'Kari Nordmann',
      email: 'kari.nordmann@example.com',
      phone: '+47 912 34 567',
    });
    expect(block(lastBlocks(details), 'booking_summary')?.contact).toContain('kari.nordmann@example.com');

    const confirmed = await customer.send({ kind: 'confirm_booking' });
    const result = block(lastBlocks(confirmed), 'booking_result');
    expect(result).toMatchObject({ status: 'CONFIRMED', reference: expect.stringMatching(/^CT-/) });
    expect(confirmed.manageUrl).toMatch(new RegExp(`/w/${organization.slug}/booking/`));

    const stored = await withTenant(organization.id, async ({ db }) => ({
      booking: await db.booking.findFirstOrThrow({
        where: { reference: result!.reference },
        include: { customer: true },
      }),
      conversation: await db.conversation.findUniqueOrThrow({ where: { id: customer.conversationId! } }),
      email: await db.outboundEmail.findFirst({ where: { toAddress: 'kari.nordmann@example.com' } }),
      audit: await db.auditLog.findFirst({ where: { action: 'booking.created' } }),
    }));
    expect(stored.booking).toMatchObject({
      origin: 'CHAT',
      conversationId: customer.conversationId,
      status: 'CONFIRMED',
    });
    expect(stored.conversation).toMatchObject({
      hadBookingIntent: true,
      customerId: stored.booking.customerId,
    });
    expect(stored.email?.textBody).toContain(confirmed.manageUrl);
    expect(stored.audit).toMatchObject({ actorType: 'ASSISTANT', entityId: stored.booking.id });
    // The raw manage token is never stored in the transcript.
    const transcript = await withTenant(organization.id, ({ db }) =>
      db.message.findMany({ where: { conversationId: customer.conversationId! } }),
    );
    expect(JSON.stringify(transcript)).not.toContain(confirmed.manageUrl!.split('/').pop());
  });

  it('only accepts slots the server offered', async () => {
    const { organization } = await setupWorkshop();
    const customer = customerSession(organization.slug);
    await customer.send({ kind: 'text', text: 'I would like to book a service' });
    const response = await customer.send({ kind: 'choose_slot', slotId: 's9' });
    expect(block(lastBlocks(response), 'slot_options')).toBeTruthy();
  });

  it('holds approval-only services as a request and creates an approval task', async () => {
    const { organization } = await setupWorkshop();
    const customer = customerSession(organization.slug);
    const offer = await customer.send({
      kind: 'text',
      text: 'My e-bike motor makes a noise, can I book a time?',
    });
    const slotId = block(lastBlocks(offer), 'slot_options')!.days[0]!.slots[0]!.id;
    await customer.send({ kind: 'choose_slot', slotId });
    await customer.send({ kind: 'submit_details', name: 'Ola Nordmann', email: 'ola@example.com' });
    const confirmed = await customer.send({ kind: 'confirm_booking' });
    expect(block(lastBlocks(confirmed), 'booking_result')?.status).toBe('PENDING');

    const task = await withTenant(organization.id, ({ db }) =>
      db.task.findFirst({ where: { kind: 'APPROVAL' } }),
    );
    expect(task?.title).toMatch(/^Approve or decline CT-/);
  });
});

describe('demo scenario 2: a question Relay cannot answer goes to a person', () => {
  it('hands off, notifies the team, creates a task, and stays quiet afterwards', async () => {
    const { organization, ctx } = await setupWorkshop();
    const customer = customerSession(organization.slug);

    const response = await customer.send({ kind: 'text', text: 'Do you offer a student discount?' });
    expect(response.assistantActive).toBe(false);
    expect(block(lastBlocks(response), 'handoff_notice')).toBeTruthy();
    expect(block(lastBlocks(response), 'details_form')?.purpose).toBe('handoff');

    const after = await withTenant(organization.id, async ({ db }) => ({
      conversation: await db.conversation.findUniqueOrThrow({ where: { id: customer.conversationId! } }),
      task: await db.task.findFirst({ where: { kind: 'HANDOFF', conversationId: customer.conversationId } }),
      notifications: await db.notification.count({ where: { membershipId: ctx.membershipId } }),
      runs: await db.automationRun.findMany({ where: { trigger: 'CONVERSATION_HANDED_OFF' } }),
      audit: await db.auditLog.findFirst({ where: { action: 'conversation.handed_off' } }),
    }));
    expect(after.conversation).toMatchObject({ status: 'NEEDS_HUMAN', assistantActive: false });
    expect(after.task).toBeTruthy();
    expect(after.notifications).toBe(1);
    expect(after.runs).toHaveLength(1);
    expect(after.runs[0]!.status).toBe('SUCCEEDED');
    expect(after.audit).toMatchObject({
      actorType: 'ASSISTANT',
      metadata: { reason: 'unanswered_question' },
    });

    // The customer can still leave an email after the hand-off…
    await customer.send({ kind: 'submit_details', name: 'Sofie Berg', email: 'sofie@example.com' });
    // …but further messages get no automatic reply: a person is on it.
    const quiet = await customer.send({ kind: 'text', text: 'Hello?' });
    expect(quiet.messages.map((m) => m.author)).toEqual(['CUSTOMER']);

    // Staff reply reaches the customer's chat (polling) and their email.
    await withTenant(organization.id, (scope) =>
      replyAsStaff(scope, ctx, {
        conversationId: customer.conversationId!,
        body: 'Hi Sofie — yes, 10% with a student card.',
      }),
    );
    const poll = await pollConversation({
      slug: organization.slug,
      conversationId: customer.conversationId!,
      token: customer.token!,
    });
    expect(poll.messages.at(-1)).toMatchObject({
      author: 'STAFF',
      body: expect.stringContaining('student card'),
    });
    const email = await withTenant(organization.id, ({ db }) =>
      db.outboundEmail.findFirst({ where: { toAddress: 'sofie@example.com' } }),
    );
    expect(email?.textBody).toContain('student card');
  });

  it('answers known questions from the FAQ and says where the answer came from', async () => {
    const { organization } = await setupWorkshop();
    const customer = customerSession(organization.slug);
    const response = await customer.send({ kind: 'text', text: 'Is there any guarantee on the work?' });
    const reply = response.messages.at(-1)!;
    expect(reply.body).toContain('three months');
    expect(block(reply.blocks, 'source')?.label).toContain('warranty');
    expect(response.assistantActive).toBe(true);
  });

  it('turns a quote request into a lead', async () => {
    const { organization, overhaul } = await setupWorkshop();
    const customer = customerSession(organization.slug);
    const response = await customer.send({
      kind: 'text',
      text: 'Could you quote a full overhaul of my old Peugeot?',
    });
    expect(block(lastBlocks(response), 'details_form')?.purpose).toBe('quote');
    await customer.send({ kind: 'submit_details', name: 'Ingrid Lie', email: 'ingrid.lie@example.com' });
    const lead = await withTenant(organization.id, ({ db }) =>
      db.lead.findFirstOrThrow({ include: { customer: true } }),
    );
    expect(lead).toMatchObject({ serviceId: overhaul.id, status: 'NEW', origin: 'CHAT' });
    expect(lead.summary).toContain('Peugeot');
    expect(lead.customer.email).toBe('ingrid.lie@example.com');
  });
});

describe('chat protection and isolation', () => {
  it('rejects oversized messages and unknown input types', async () => {
    const { organization } = await setupWorkshop();
    const customer = customerSession(organization.slug);
    await expect(customer.send({ kind: 'text', text: 'x'.repeat(1001) })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(customer.send({ kind: 'delete_everything' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('requires the challenge for a new conversation (honeypot filled = bot)', async () => {
    const { organization } = await setupWorkshop();
    await expect(
      handleChatInput({
        slug: organization.slug,
        ip: randomUUID(),
        conversationId: null,
        token: null,
        input: { kind: 'text', text: 'hi' },
        challenge: {
          honeypot: 'https://spam.example',
          formToken: demoChallengeProvider.issue(new Date(Date.now() - 5_000)).formToken,
        },
      }),
    ).rejects.toMatchObject({ code: 'CHALLENGE_FAILED' });
  });

  it('hands spam to a person instead of answering it', async () => {
    const { organization } = await setupWorkshop();
    const customer = customerSession(organization.slug);
    const response = await customer.send({
      kind: 'text',
      text: 'Cheap SEO services and backlinks for your website!',
    });
    expect(response.assistantActive).toBe(false);
    const conversation = await withTenant(organization.id, ({ db }) =>
      db.conversation.findUniqueOrThrow({ where: { id: customer.conversationId! } }),
    );
    expect(conversation.flaggedReason).toContain('spam_terms');
  });

  it('refuses a conversation with the wrong token or under another business’s address', async () => {
    const a = await setupWorkshop();
    const b = await setupWorkshop();
    const customer = customerSession(a.organization.slug);
    await customer.send({ kind: 'text', text: 'Hi' });

    await expect(
      handleChatInput({
        slug: a.organization.slug,
        ip: randomUUID(),
        conversationId: customer.conversationId,
        token: 'wrong',
        input: { kind: 'text', text: 'hi' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      handleChatInput({
        slug: b.organization.slug,
        ip: randomUUID(),
        conversationId: customer.conversationId,
        token: customer.token,
        input: { kind: 'text', text: 'hi' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('automation engine guarantees', () => {
  it('never runs the same automation twice for one event', async () => {
    const { organization } = await setupWorkshop();
    const conversation = await withTenant(organization.id, ({ db, organizationId }) =>
      db.conversation.create({
        data: { organizationId, channel: 'WEB_CHAT', accessTokenHash: randomUUID() },
      }),
    );
    const event = domainEvent({
      type: 'conversation.handed_off',
      organizationId: organization.id,
      conversationId: conversation.id,
      reason: 'customer_asked',
    });
    const first = await runAutomations([event]);
    const second = await runAutomations([event]);
    expect(first.map((r) => r.outcome)).toEqual(['succeeded']);
    expect(second.map((r) => r.outcome)).toEqual(['duplicate']);
    expect(
      await withTenant(organization.id, ({ db }) =>
        db.task.count({ where: { conversationId: conversation.id } }),
      ),
    ).toBe(1);
  });

  it('records a failed run when a stored configuration is no longer valid', async () => {
    const { organization } = await setupWorkshop();
    await withTenant(organization.id, ({ db, organizationId }) =>
      db.automation.create({
        data: {
          organizationId,
          name: 'Broken',
          trigger: 'LEAD_CREATED',
          actions: [{ type: 'launch_rockets' }],
        },
      }),
    );
    const event = domainEvent({
      type: 'lead.created',
      organizationId: organization.id,
      leadId: randomUUID(),
    });
    const [report] = await runAutomations([event]);
    expect(report?.outcome).toBe('invalid');
    const run = await withTenant(organization.id, ({ db }) =>
      db.automationRun.findFirstOrThrow({ where: { automationId: report!.automationId } }),
    );
    expect(run).toMatchObject({ status: 'FAILED', error: expect.stringContaining('no longer valid') });
  });
});
