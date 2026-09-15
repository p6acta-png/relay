import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@/lib/db';
import { addDays, isoWeekday, toLocalDate, zonedTimeToUtc } from '@/lib/time';
import {
  cancelBooking,
  createBooking,
  decideBooking,
  findBookingByManageToken,
  rescheduleBooking,
} from '@/modules/scheduling/bookings';
import type { ActorContext, MemberContext } from '@/modules/tenancy/context';
import { resetDatabase } from '../support/database';
import { createBusiness } from '../support/factories';

const TZ = 'Europe/Oslo';

/** A weekday at least three days from now, so minimum-notice rules never interfere. */
function futureWeekday(offsetDays = 3) {
  let date = addDays(toLocalDate(new Date(), TZ), offsetDays);
  while (isoWeekday(date) > 5) date = addDays(date, 1);
  return date;
}
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return zonedTimeToUtc(date, h! * 60 + m!, TZ);
};

const customer = (n: number) => ({
  name: `Kari Nordmann ${n}`,
  email: `kari${n}@example.com`,
  phone: '+47 912 34 567',
});

async function setupWorkshop() {
  const business = await createBusiness({ businessName: 'Test Bikes' });
  const { organization, ctx } = business;
  const extra = await withTenant(organization.id, async ({ db, organizationId }) => {
    const service = await db.service.findFirstOrThrow({ where: { organizationId } });
    const owner = await db.staffMember.findFirstOrThrow({ where: { organizationId } });
    const second = await db.staffMember.create({
      data: { organizationId, displayName: 'Jonas', sortOrder: 1 },
    });
    await db.workingHours.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        organizationId,
        staffMemberId: second.id,
        weekday,
        startMinute: 8 * 60,
        endMinute: 16 * 60,
      })),
    });
    await db.staffService.create({
      data: { organizationId, staffMemberId: second.id, serviceId: service.id },
    });
    const approval = await db.service.create({
      data: { organizationId, name: 'E-bike diagnostics', durationMinutes: 45, confirmationMode: 'APPROVAL' },
    });
    await db.staffService.createMany({
      data: [owner.id, second.id].map((staffMemberId) => ({
        organizationId,
        staffMemberId,
        serviceId: approval.id,
      })),
    });
    return { service, approval, owner, second };
  });
  return { ...business, ...extra };
}

const book = (ctx: ActorContext, input: Parameters<typeof createBooking>[2]) =>
  withTenant(ctx.organizationId, (scope) => createBooking(scope, ctx, input));

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('creating bookings', () => {
  it('confirms an instant service, records it and returns an event and a private manage link', async () => {
    const { ctx, service } = await setupWorkshop();
    const date = futureWeekday();
    const { result, events } = await book(ctx, {
      serviceId: service.id,
      startsAt: at(date, '10:00'),
      customer: customer(1),
      origin: 'DASHBOARD',
    });

    expect(result.booking).toMatchObject({
      status: 'CONFIRMED',
      reference: expect.stringMatching(/^TB-[2-9A-Z]{5}$/),
    });
    expect(events.map((e) => e.type)).toEqual(['booking.confirmed']);

    const { audit, found } = await withTenant(ctx.organizationId, async (scope) => ({
      audit: await scope.db.auditLog.findMany({ where: { entityId: result.booking.id } }),
      found: await findBookingByManageToken(scope, result.manageToken),
    }));
    expect(audit.map((a) => a.action)).toEqual(['booking.created']);
    expect(found?.id).toBe(result.booking.id);
  });

  it('holds approval-required services as pending until staff decide', async () => {
    const { ctx, approval } = await setupWorkshop();
    const { result, events } = await book(ctx, {
      serviceId: approval.id,
      startsAt: at(futureWeekday(), '09:00'),
      customer: customer(2),
      origin: 'CHAT',
    });
    expect(result.booking.status).toBe('PENDING');
    expect(events[0]!.type).toBe('booking.requested');

    const decided = await withTenant(ctx.organizationId, (scope) =>
      decideBooking(scope, ctx, { bookingId: result.booking.id, decision: 'APPROVE' }),
    );
    expect(decided.result.status).toBe('CONFIRMED');
    expect(decided.events[0]!.type).toBe('booking.confirmed');
    await expect(
      withTenant(ctx.organizationId, (scope) =>
        decideBooking(scope, ctx, { bookingId: result.booking.id, decision: 'DECLINE' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('rejects times outside working hours', async () => {
    const { ctx, service } = await setupWorkshop();
    await expect(
      book(ctx, {
        serviceId: service.id,
        startsAt: at(futureWeekday(), '06:30'),
        customer: customer(3),
        origin: 'DASHBOARD',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('validates customer details', async () => {
    const { ctx, service } = await setupWorkshop();
    await expect(
      book(ctx, {
        serviceId: service.id,
        startsAt: at(futureWeekday(), '10:00'),
        customer: { name: 'K', email: 'not-an-email' },
        origin: 'DASHBOARD',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { 'customer.email': expect.any(String) } });
  });
});

describe('double-booking protection', () => {
  it('lets only one of two simultaneous requests book the same person at the same time', async () => {
    const { ctx, service, owner } = await setupWorkshop();
    const startsAt = at(futureWeekday(4), '11:00');
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        book(ctx, {
          serviceId: service.id,
          startsAt,
          staffMemberId: owner.id,
          customer: customer(10 + n),
          origin: 'CHAT',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'CONFLICT' });
  });

  it('gives simultaneous “anyone available” requests to different people, then refuses the third', async () => {
    const { ctx, service } = await setupWorkshop();
    const startsAt = at(futureWeekday(5), '13:00');
    const results = await Promise.allSettled(
      [1, 2, 3].map((n) =>
        book(ctx, { serviceId: service.id, startsAt, customer: customer(20 + n), origin: 'CHAT' }),
      ),
    );
    const booked = results.flatMap((r) =>
      r.status === 'fulfilled' ? [r.value.result.booking.staffMemberId] : [],
    );
    expect(booked).toHaveLength(2);
    expect(new Set(booked).size).toBe(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('cancelling and moving bookings', () => {
  it('lets a customer cancel outside the cancellation window, which frees the slot', async () => {
    const { ctx, service, owner, organization } = await setupWorkshop();
    const startsAt = at(futureWeekday(6), '14:00');
    const { result } = await book(ctx, {
      serviceId: service.id,
      startsAt,
      staffMemberId: owner.id,
      customer: customer(30),
      origin: 'CHAT',
    });

    const customerCtx: ActorContext = {
      kind: 'customer',
      organizationId: organization.id,
      customerId: result.booking.customerId,
    };
    const cancelled = await withTenant(organization.id, (scope) =>
      cancelBooking(scope, customerCtx, { bookingId: result.booking.id }),
    );
    expect(cancelled.events[0]).toMatchObject({ type: 'booking.cancelled', reason: 'customer' });

    await expect(
      book(ctx, {
        serviceId: service.id,
        startsAt,
        staffMemberId: owner.id,
        customer: customer(31),
        origin: 'DASHBOARD',
      }),
    ).resolves.toBeTruthy();
  });

  it('refuses customer cancellation inside the window and for someone else’s booking', async () => {
    const { ctx, service, organization } = await setupWorkshop();
    await prisma.organization.update({
      where: { id: organization.id },
      data: { cancellationWindowHours: 336 },
    });
    const { result } = await book(ctx, {
      serviceId: service.id,
      startsAt: at(futureWeekday(), '12:00'),
      customer: customer(40),
      origin: 'CHAT',
    });

    const owner: ActorContext = {
      kind: 'customer',
      organizationId: organization.id,
      customerId: result.booking.customerId,
    };
    const stranger: ActorContext = {
      kind: 'customer',
      organizationId: organization.id,
      customerId: ctx.userId,
    };
    await expect(
      withTenant(organization.id, (scope) => cancelBooking(scope, owner, { bookingId: result.booking.id })),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(
      withTenant(organization.id, (scope) =>
        cancelBooking(scope, stranger, { bookingId: result.booking.id }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('moves a booking to a free time but not onto someone else’s booking', async () => {
    const { ctx, service, owner } = await setupWorkshop();
    const date = futureWeekday(7);
    const first = await book(ctx, {
      serviceId: service.id,
      startsAt: at(date, '09:00'),
      staffMemberId: owner.id,
      customer: customer(50),
      origin: 'DASHBOARD',
    });
    await book(ctx, {
      serviceId: service.id,
      startsAt: at(date, '11:00'),
      staffMemberId: owner.id,
      customer: customer(51),
      origin: 'DASHBOARD',
    });

    await expect(
      withTenant(ctx.organizationId, (scope) =>
        rescheduleBooking(scope, ctx, {
          bookingId: first.result.booking.id,
          startsAt: at(date, '11:00'),
          staffMemberId: owner.id,
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const moved = await withTenant(ctx.organizationId, (scope) =>
      rescheduleBooking(scope, ctx, {
        bookingId: first.result.booking.id,
        startsAt: at(date, '09:30'),
        staffMemberId: owner.id,
      }),
    );
    expect(moved.startsAt.toISOString()).toBe(at(date, '09:30').toISOString());
  });
});

describe('who may do what with bookings', () => {
  it('lets the assistant create bookings but never decide or cancel them', async () => {
    const { ctx, approval, organization } = await setupWorkshop();
    const assistant: ActorContext = {
      kind: 'assistant',
      organizationId: organization.id,
      conversationId: organization.id,
    };
    const { result } = await book(assistant, {
      serviceId: approval.id,
      startsAt: at(futureWeekday(), '15:00'),
      customer: customer(60),
      origin: 'CHAT',
    });
    await expect(
      withTenant(ctx.organizationId, (scope) =>
        decideBooking(scope, assistant, { bookingId: result.booking.id, decision: 'APPROVE' }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      withTenant(ctx.organizationId, (scope) =>
        cancelBooking(scope, assistant, { bookingId: result.booking.id }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not let automations create bookings', async () => {
    const { service, organization } = await setupWorkshop();
    const automation: ActorContext = {
      kind: 'automation',
      organizationId: organization.id,
      automationId: organization.id,
      automationName: 'x',
    };
    await expect(
      book(automation, {
        serviceId: service.id,
        startsAt: at(futureWeekday(), '10:00'),
        customer: customer(70),
        origin: 'CHAT',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cannot book another business’s service', async () => {
    const a = await setupWorkshop();
    const b = await setupWorkshop();
    await expect(
      book(a.ctx, {
        serviceId: b.service.id,
        startsAt: at(futureWeekday(), '10:00'),
        customer: customer(80),
        origin: 'DASHBOARD',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a context that does not match the transaction’s organization', async () => {
    const a = await setupWorkshop();
    const b = await setupWorkshop();
    const wrong: MemberContext = { ...a.ctx };
    await expect(
      withTenant(b.organization.id, (scope) =>
        createBooking(scope, wrong, {
          serviceId: b.service.id,
          startsAt: at(futureWeekday(), '10:00'),
          customer: customer(90),
          origin: 'DASHBOARD',
        }),
      ),
    ).rejects.toThrow(/different organizations/);
  });
});
