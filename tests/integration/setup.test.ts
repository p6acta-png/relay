import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@/lib/db';
import { addDays, isoWeekday, toLocalDate, zonedTimeToUtc } from '@/lib/time';
import {
  addTimeOff,
  saveKnowledgeItem,
  saveService,
  saveStaffMember,
  updateBusinessSettings,
} from '@/modules/catalog/manage';
import { receiveDemoEmail } from '@/modules/conversations/email-channel';
import { findSlotsForService } from '@/modules/scheduling/availability';
import { resetDatabase } from '../support/database';
import { addMember, createBusiness } from '../support/factories';

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

const TZ = 'Europe/Oslo';

/** A weekday at least two days ahead, so minimum-notice rules never interfere. */
function nextWorkday() {
  let date = addDays(toLocalDate(new Date(), TZ), 2);
  while (isoWeekday(date) > 5) date = addDays(date, 1);
  return date;
}

const validSettings = {
  name: 'Setup Test Workshop',
  tagline: '',
  description: '',
  contactEmail: '',
  contactPhone: '',
  addressLine: '',
  city: 'Oslo',
  openingHours: [{ weekday: 1, opens: 480, closes: 960 }],
  minNoticeMinutes: 60,
  bookingHorizonDays: 30,
  cancellationWindowHours: 24,
  slotIntervalMinutes: 30,
  handoffReplyHours: 4,
};

describe('setup permissions', () => {
  it('lets staff read setup but not change it', async () => {
    const { organization } = await createBusiness();
    const staff = await addMember(organization.id, 'STAFF');

    await expect(
      withTenant(organization.id, (scope) => updateBusinessSettings(scope, staff.ctx, validSettings)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      withTenant(organization.id, (scope) =>
        saveKnowledgeItem(scope, staff.ctx, null, { question: 'Anything?', answer: 'Nope.', keywords: 'x' }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      receiveDemoEmail(staff.ctx, {
        fromName: 'Kari',
        fromEmail: 'kari@example.com',
        subject: 'Hi',
        body: 'Hello',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses to mix one business’s context with another business’s scope', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    await expect(
      withTenant(a.organization.id, (scope) => updateBusinessSettings(scope, b.ctx, validSettings)),
    ).rejects.toThrow(/different organizations/);
  });
});

describe('business settings', () => {
  it('validates booking rules and audits which settings changed', async () => {
    const { organization, ctx } = await createBusiness();

    await expect(
      withTenant(organization.id, (scope) =>
        updateBusinessSettings(scope, ctx, {
          ...validSettings,
          slotIntervalMinutes: 25,
          bookingHorizonDays: 0,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { slotIntervalMinutes: expect.any(String), bookingHorizonDays: expect.any(String) },
    });

    await withTenant(organization.id, (scope) => updateBusinessSettings(scope, ctx, validSettings));
    const stored = await withTenant(organization.id, async ({ db }) => ({
      organization: await db.organization.findUniqueOrThrow({ where: { id: organization.id } }),
      audit: await db.auditLog.findFirstOrThrow({ where: { action: 'settings.business_updated' } }),
    }));
    expect(stored.organization).toMatchObject({
      name: 'Setup Test Workshop',
      minNoticeMinutes: 60,
      contactEmail: null,
    });
    const changed = (stored.audit.metadata as { changed: string[] }).changed;
    expect(changed).toEqual(expect.arrayContaining(['name', 'minNoticeMinutes', 'openingHours']));
    expect(changed).not.toContain('slotIntervalMinutes');
  });
});

describe('services', () => {
  it('requires staff for bookable services and rejects duplicate names', async () => {
    const { organization, ctx } = await createBusiness();
    const base = {
      name: 'Wheel truing',
      description: '',
      kind: 'BOOKABLE',
      durationMinutes: 30,
      priceNok: '450',
      priceIsFrom: false,
      confirmationMode: 'INSTANT',
      keywords: 'Wheel, truing, wobbly wheel, wheel',
      active: true,
      staffIds: [],
    };

    await expect(
      withTenant(organization.id, (scope) => saveService(scope, ctx, null, base)),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { staffIds: expect.any(String) },
    });

    const staffId = await withTenant(
      organization.id,
      async ({ db }) => (await db.staffMember.findFirstOrThrow()).id,
    );
    const { id } = await withTenant(organization.id, (scope) =>
      saveService(scope, ctx, null, { ...base, staffIds: [staffId] }),
    );
    const created = await withTenant(organization.id, ({ db }) =>
      db.service.findUniqueOrThrow({ where: { id }, include: { staff: true } }),
    );
    expect(created).toMatchObject({ priceMinor: 45_000, keywords: ['wheel', 'truing', 'wobbly wheel'] });
    expect(created.staff.map((s) => s.staffMemberId)).toEqual([staffId]);

    await expect(
      withTenant(organization.id, (scope) => saveService(scope, ctx, null, { ...base, staffIds: [staffId] })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('cannot link a staff member from another business', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    const foreignStaffId = await withTenant(
      b.organization.id,
      async ({ db }) => (await db.staffMember.findFirstOrThrow()).id,
    );
    await expect(
      withTenant(a.organization.id, (scope) =>
        saveService(scope, a.ctx, null, {
          name: 'Sneaky service',
          kind: 'BOOKABLE',
          durationMinutes: 30,
          priceNok: '',
          confirmationMode: 'INSTANT',
          keywords: '',
          staffIds: [foreignStaffId],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('staff, hours and time off', () => {
  it('replaces working hours and refuses a login from another business', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    const staffId = await withTenant(
      a.organization.id,
      async ({ db }) => (await db.staffMember.findFirstOrThrow()).id,
    );
    const input = {
      displayName: 'Ola',
      title: '',
      active: true,
      membershipId: '',
      hours: [{ weekday: 2, startMinute: 600, endMinute: 900 }],
    };

    await expect(
      withTenant(a.organization.id, (scope) =>
        saveStaffMember(scope, a.ctx, staffId, { ...input, membershipId: b.membership.id }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      withTenant(a.organization.id, (scope) =>
        saveStaffMember(scope, a.ctx, staffId, {
          ...input,
          hours: [{ weekday: 2, startMinute: 900, endMinute: 600 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    await withTenant(a.organization.id, (scope) => saveStaffMember(scope, a.ctx, staffId, input));
    const hours = await withTenant(a.organization.id, ({ db }) =>
      db.workingHours.findMany({ where: { staffMemberId: staffId } }),
    );
    expect(hours).toEqual([expect.objectContaining({ weekday: 2, startMinute: 600, endMinute: 900 })]);
  });

  it('removes offered times for a closed day and reports bookings that clash', async () => {
    const { organization, ctx } = await createBusiness();
    const day = nextWorkday();
    const serviceId = await withTenant(
      organization.id,
      async ({ db }) => (await db.service.findFirstOrThrow()).id,
    );
    const before = await withTenant(organization.id, (scope) =>
      findSlotsForService(scope, { serviceId, from: day, to: day }),
    );
    expect(before.slots.length).toBeGreaterThan(0);

    const staffId = await withTenant(
      organization.id,
      async ({ db }) => (await db.staffMember.findFirstOrThrow()).id,
    );
    await withTenant(organization.id, async ({ db, organizationId }) =>
      db.booking.create({
        data: {
          organizationId,
          customerId: (
            await db.customer.create({ data: { organizationId, name: 'Clash', email: 'clash@example.com' } })
          ).id,
          serviceId,
          staffMemberId: staffId,
          reference: 'ST-CLASH1',
          startsAt: before.slots[0]!.startsAt,
          endsAt: before.slots[0]!.endsAt,
          status: 'CONFIRMED',
          origin: 'DASHBOARD',
        },
      }),
    );

    const { clashes } = await withTenant(organization.id, (scope) =>
      addTimeOff(scope, ctx, {
        staffMemberId: '',
        startsAt: zonedTimeToUtc(day, 0, TZ),
        endsAt: zonedTimeToUtc(addDays(day, 1), 0, TZ),
        reason: 'Inventory day',
      }),
    );
    expect(clashes).toBe(1);
    const after = await withTenant(organization.id, (scope) =>
      findSlotsForService(scope, { serviceId, from: day, to: day }),
    );
    expect(after.slots).toEqual([]);
  });
});

describe('knowledge base', () => {
  it('needs keywords before an answer can be published', async () => {
    const { organization, ctx } = await createBusiness();
    const answer = {
      question: 'Do you sell used bikes?',
      answer: 'Sometimes — ask in the shop.',
      keywords: ' , ',
    };
    await expect(
      withTenant(organization.id, (scope) =>
        saveKnowledgeItem(scope, ctx, null, { ...answer, published: true }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { keywords: expect.any(String) } });
    await expect(
      withTenant(organization.id, (scope) =>
        saveKnowledgeItem(scope, ctx, null, { ...answer, published: false }),
      ),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });
});

describe('simulated email channel', () => {
  async function businessWithFaq() {
    const business = await createBusiness();
    await withTenant(business.organization.id, (scope) =>
      saveKnowledgeItem(scope, business.ctx, null, {
        question: 'Where can I park?',
        answer: 'There is free parking behind the workshop.',
        keywords: 'parking, park, car',
        published: true,
      }),
    );
    return business;
  }

  it('answers a known question from the knowledge base and stores the reply in the outbox', async () => {
    const { organization, ctx } = await businessWithFaq();
    const result = await receiveDemoEmail(ctx, {
      fromName: 'Kari Nordmann',
      fromEmail: 'Kari@Example.com',
      subject: 'Parking?',
      body: 'Is there anywhere to park when I drop off my bike?',
    });
    expect(result.answered).toBe(true);

    const stored = await withTenant(organization.id, async ({ db }) => ({
      conversation: await db.conversation.findUniqueOrThrow({
        where: { id: result.conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } }, customer: true },
      }),
      email: await db.outboundEmail.findFirstOrThrow({ where: { relatedId: result.conversationId } }),
    }));
    expect(stored.conversation).toMatchObject({ channel: 'EMAIL', status: 'OPEN' });
    expect(stored.conversation.customer?.email).toBe('kari@example.com');
    expect(stored.conversation.messages.map((m) => m.author)).toEqual(['CUSTOMER', 'ASSISTANT']);
    expect(stored.email).toMatchObject({
      toAddress: 'kari@example.com',
      subject: 'Re: Parking?',
      status: 'STORED_IN_OUTBOX',
    });
    expect(stored.email.textBody).toContain('free parking behind the workshop');
  });

  it('hands an unknown question to the team instead of guessing', async () => {
    const { organization, ctx } = await businessWithFaq();
    const result = await receiveDemoEmail(ctx, {
      fromName: 'Per Hansen',
      fromEmail: 'per@example.com',
      subject: 'Club discount',
      body: 'Do you give discounts for a cycling club of 12 people?',
    });
    expect(result.answered).toBe(false);

    const stored = await withTenant(organization.id, async ({ db }) => ({
      conversation: await db.conversation.findUniqueOrThrow({ where: { id: result.conversationId } }),
      email: await db.outboundEmail.findFirstOrThrow({ where: { relatedId: result.conversationId } }),
      audit: await db.auditLog.findFirst({
        where: { action: 'conversation.handed_off', entityId: result.conversationId },
      }),
    }));
    expect(stored.conversation).toMatchObject({ status: 'NEEDS_HUMAN', assistantActive: false });
    expect(stored.email.textBody).toMatch(/will reply within 4 hours/);
    expect(stored.audit).toMatchObject({ actorType: 'ASSISTANT' });
  });

  it('does not post chat-only automation replies into an email conversation', async () => {
    const { organization, ctx } = await businessWithFaq();
    const automation = await withTenant(organization.id, ({ db, organizationId }) =>
      db.automation.create({
        data: {
          organizationId,
          name: 'Chat greeting',
          trigger: 'CONVERSATION_STARTED',
          actions: [{ type: 'send_chat_reply', message: 'Welcome to the chat!' }],
        },
      }),
    );
    const result = await receiveDemoEmail(ctx, {
      fromName: 'Kari Nordmann',
      fromEmail: 'kari@example.com',
      subject: 'Parking?',
      body: 'Is there anywhere to park?',
    });

    const stored = await withTenant(organization.id, async ({ db }) => ({
      messages: await db.message.findMany({ where: { conversationId: result.conversationId } }),
      run: await db.automationRun.findFirstOrThrow({ where: { automationId: automation.id } }),
    }));
    expect(stored.messages.map((m) => m.body)).not.toContain('Welcome to the chat!');
    expect(stored.run.steps).toEqual([
      expect.objectContaining({ status: 'skipped', detail: 'Not a chat conversation.' }),
    ]);
  });

  it('validates the simulated email', async () => {
    const { ctx } = await createBusiness();
    await expect(
      receiveDemoEmail(ctx, { fromName: 'K', fromEmail: 'not-an-email', subject: '', body: 'Hi' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: {
        fromName: expect.any(String),
        fromEmail: expect.any(String),
        subject: expect.any(String),
        body: expect.any(String),
      },
    });
  });
});
