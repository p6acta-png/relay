import 'server-only';
import { z } from 'zod';
import type { BookingStatus } from '@/generated/prisma/enums';
import { PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, postgresErrorCode, type TenantScope } from '@/lib/db';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { env } from '@/lib/env';
import { formatInZone } from '@/lib/time';
import { generateReference, generateToken, hashToken } from '@/lib/tokens';
import { recordAudit } from '@/modules/audit/audit';
import { upsertCustomer } from '@/modules/customers/customers';
import { customerDetailsSchema } from '@/modules/customers/schemas';
import { domainEvent, type DomainEvent, type WithEvents } from '@/modules/events';
import { queueEmail } from '@/modules/notifications/email';
import { actorOf, authorizeIn, type ActorContext } from '@/modules/tenancy/context';
import { findExactSlot } from './availability';

const ACTIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export const bookingInputSchema = z.object({
  serviceId: z.uuid(),
  startsAt: z.coerce.date(),
  staffMemberId: z.uuid().optional(),
  customer: customerDetailsSchema,
  notes: z.string().trim().max(500).optional(),
  origin: z.enum(['CHAT', 'EMAIL', 'DASHBOARD']),
  conversationId: z.uuid().optional(),
});

export type BookingInput = z.input<typeof bookingInputSchema>;

const bookingInclude = {
  service: {
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceMinor: true,
      priceIsFrom: true,
      confirmationMode: true,
    },
  },
  staffMember: { select: { id: true, displayName: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
} as const;

function referencePrefix(organizationName: string) {
  const initials = organizationName
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join('')
    .normalize('NFKD')
    .replace(/[^A-Z]/g, '');
  return (initials + 'RL').slice(0, 2);
}

// #region learn:create-booking
export async function createBooking(
  scope: TenantScope,
  ctx: ActorContext,
  rawInput: BookingInput,
): Promise<WithEvents<{ booking: Awaited<ReturnType<typeof loadBooking>>; manageToken: string }>> {
  authorizeIn(scope, ctx, 'bookings.create');
  const parsed = bookingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Check the booking details.', fieldErrorsFrom(parsed.error.issues));
  }
  const input = parsed.data;
  const { db, organizationId } = scope;
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, timezone: true, slug: true, addressLine: true, cancellationWindowHours: true },
  });

  // 1. Business rules: re-check this exact time with the same rules the customer was shown.
  //    Never trust that a slot offered a minute ago is still free.
  const { service, slot } = await findExactSlot(scope, {
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    staffMemberId: input.staffMemberId,
    timeZone: organization.timezone,
  });
  if (!slot) throw new AppError('CONFLICT', 'That time is no longer available. Please choose another time.');

  const { customer } = await upsertCustomer(scope, input.customer);
  const status: BookingStatus = service.confirmationMode === 'APPROVAL' ? 'PENDING' : 'CONFIRMED';
  const manageToken = generateToken();

  // 2. Insert. The database's exclusion constraint is the final guard: if another request took
  //    this person at this time in the meantime, the insert fails and we try the next free person.
  const candidates = input.staffMemberId ? [input.staffMemberId] : slot.alternatives;
  let created: { id: string } | null = null;
  for (let i = 0, attempts = 0; i < candidates.length && attempts < candidates.length + 3; attempts++) {
    await db.$executeRaw`SAVEPOINT create_booking`;
    try {
      created = await db.booking.create({
        data: {
          organizationId,
          reference: generateReference(referencePrefix(organization.name)),
          serviceId: service.id,
          staffMemberId: candidates[i]!,
          customerId: customer.id,
          conversationId: input.conversationId ?? null,
          createdByMembershipId: ctx.kind === 'member' ? ctx.membershipId : null,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          status,
          origin: input.origin,
          notes: input.notes || null,
          manageTokenHash: hashToken(manageToken),
        },
        select: { id: true },
      });
      await db.$executeRaw`RELEASE SAVEPOINT create_booking`;
      break;
    } catch (error) {
      const code = postgresErrorCode(error);
      if (code !== PG_EXCLUSION_VIOLATION && code !== PG_UNIQUE_VIOLATION) throw error;
      await db.$executeRaw`ROLLBACK TO SAVEPOINT create_booking`;
      if (code === PG_EXCLUSION_VIOLATION) i++; // that person was just taken; a reference clash just retries
    }
  }
  if (!created)
    throw new AppError('CONFLICT', 'That time was just taken by someone else. Please choose another time.');

  const booking = await loadBooking(scope, created.id);

  // 3. Record what happened, in the same transaction.
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: status === 'PENDING' ? 'booking.requested' : 'booking.created',
    entityType: 'Booking',
    entityId: booking.id,
    metadata: { status, origin: input.origin, serviceId: service.id, staffMemberId: booking.staffMemberId },
  });

  // The private link can only be sent now: afterwards only its hash exists.
  if (booking.customer.email) {
    const manageUrl = `${env.APP_URL}/w/${organization.slug}/booking/${manageToken}`;
    const when = formatInZone(booking.startsAt, organization.timezone, "EEEE d MMMM 'at' HH:mm");
    await queueEmail(scope, {
      to: booking.customer.email,
      subject:
        status === 'PENDING'
          ? `We received your request: ${service.name}, ${when}`
          : `Booking confirmed: ${service.name}, ${when}`,
      text: [
        `Hi ${booking.customer.name?.split(' ')[0] ?? 'there'},`,
        '',
        status === 'PENDING'
          ? `Thanks for your request. ${organization.name} will confirm it shortly.`
          : `You're booked in at ${organization.name}.`,
        '',
        `${service.name}`,
        `${when}`,
        organization.addressLine ? organization.addressLine : null,
        `Reference: ${booking.reference}`,
        '',
        `Change or cancel (up to ${organization.cancellationWindowHours} hours before): ${manageUrl}`,
      ]
        .filter((line) => line !== null)
        .join('\n'),
      related: { type: 'Booking', id: booking.id },
    });
  }

  // 4. Tell the rest of the system — automations run after the transaction commits.
  const event = domainEvent({
    type: status === 'PENDING' ? 'booking.requested' : 'booking.confirmed',
    organizationId,
    bookingId: booking.id,
    serviceId: service.id,
    customerId: customer.id,
    conversationId: input.conversationId ?? null,
    channel: input.origin === 'EMAIL' ? 'EMAIL' : input.origin === 'CHAT' ? 'WEB_CHAT' : null,
  });
  return { result: { booking, manageToken }, events: [event] };
}
// #endregion learn:create-booking

async function loadBooking({ db, organizationId }: TenantScope, id: string) {
  const booking = await db.booking.findFirst({ where: { id, organizationId }, include: bookingInclude });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  return booking;
}

export async function getBooking(scope: TenantScope, ctx: ActorContext, id: string) {
  authorizeIn(scope, ctx, 'bookings.view');
  const booking = await scope.db.booking.findFirst({
    where: { id, organizationId: scope.organizationId },
    include: { ...bookingInclude, conversation: { select: { id: true, channel: true } }, tasks: true },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  return booking;
}

export async function listBookings(
  scope: TenantScope,
  ctx: ActorContext,
  query: { from: Date; to: Date; status?: BookingStatus[]; staffMemberId?: string },
) {
  authorizeIn(scope, ctx, 'bookings.view');
  return scope.db.booking.findMany({
    where: {
      organizationId: scope.organizationId,
      startsAt: { gte: query.from, lt: query.to },
      ...(query.status ? { status: { in: query.status } } : {}),
      ...(query.staffMemberId ? { staffMemberId: query.staffMemberId } : {}),
    },
    orderBy: { startsAt: 'asc' },
    include: bookingInclude,
    take: 500,
  });
}

export async function listPendingBookings(scope: TenantScope, ctx: ActorContext) {
  authorizeIn(scope, ctx, 'bookings.view');
  return scope.db.booking.findMany({
    where: { organizationId: scope.organizationId, status: 'PENDING', startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    include: bookingInclude,
  });
}

export async function decideBooking(
  scope: TenantScope,
  ctx: ActorContext,
  params: { bookingId: string; decision: 'APPROVE' | 'DECLINE'; reason?: string },
): Promise<WithEvents<{ status: BookingStatus }>> {
  authorizeIn(scope, ctx, 'bookings.decide');
  const booking = await loadBooking(scope, params.bookingId);
  if (booking.status !== 'PENDING') {
    throw new AppError('INVALID_STATE', 'This booking has already been decided.');
  }
  const status: BookingStatus = params.decision === 'APPROVE' ? 'CONFIRMED' : 'DECLINED';
  // Guarded update: only succeeds if the booking is still pending (two staff clicking at once).
  const { count } = await scope.db.booking.updateMany({
    where: { id: booking.id, organizationId: scope.organizationId, status: 'PENDING' },
    data: {
      status,
      decidedAt: new Date(),
      cancellationReason: params.decision === 'DECLINE' ? params.reason?.slice(0, 300) || null : null,
    },
  });
  if (count === 0) throw new AppError('INVALID_STATE', 'This booking has already been decided.');

  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: params.decision === 'APPROVE' ? 'booking.approved' : 'booking.declined',
    entityType: 'Booking',
    entityId: booking.id,
    metadata: { from: 'PENDING', to: status },
  });
  const base = {
    organizationId: scope.organizationId,
    bookingId: booking.id,
    serviceId: booking.serviceId,
    customerId: booking.customerId,
    conversationId: booking.conversationId,
  };
  const events: DomainEvent[] = [
    params.decision === 'APPROVE'
      ? domainEvent({ ...base, type: 'booking.confirmed' })
      : domainEvent({ ...base, type: 'booking.cancelled', reason: 'declined' }),
  ];
  return { result: { status }, events };
}

// #region learn:cancel-booking
export async function cancelBooking(
  scope: TenantScope,
  ctx: ActorContext,
  params: { bookingId: string; reason?: string },
): Promise<WithEvents<null>> {
  authorizeIn(scope, ctx, 'bookings.cancel');
  const booking = await loadBooking(scope, params.bookingId);
  if (!ACTIVE.includes(booking.status)) throw new AppError('INVALID_STATE', 'This booking is not active.');

  if (ctx.kind === 'customer') {
    // Customers may only cancel their own booking, and only outside the cancellation window.
    if (ctx.customerId !== booking.customerId)
      throw new AppError('FORBIDDEN', 'You cannot cancel this booking.');
    const organization = await scope.db.organization.findUniqueOrThrow({
      where: { id: scope.organizationId },
      select: { cancellationWindowHours: true, contactPhone: true },
    });
    const hoursLeft = (booking.startsAt.getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < organization.cancellationWindowHours) {
      throw new AppError(
        'INVALID_STATE',
        `Bookings can be cancelled online up to ${organization.cancellationWindowHours} hours before. Please contact the business directly.`,
      );
    }
  }
  // #endregion learn:cancel-booking

  const { count } = await scope.db.booking.updateMany({
    where: { id: booking.id, organizationId: scope.organizationId, status: { in: ACTIVE } },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: params.reason?.slice(0, 300) || null,
    },
  });
  if (count === 0) throw new AppError('INVALID_STATE', 'This booking is not active.');

  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'booking.cancelled',
    entityType: 'Booking',
    entityId: booking.id,
    metadata: { from: booking.status, by: ctx.kind },
  });
  return {
    result: null,
    events: [
      domainEvent({
        type: 'booking.cancelled',
        organizationId: scope.organizationId,
        bookingId: booking.id,
        serviceId: booking.serviceId,
        customerId: booking.customerId,
        conversationId: booking.conversationId,
        reason: ctx.kind === 'customer' ? 'customer' : 'staff',
      }),
    ],
  };
}

export async function rescheduleBooking(
  scope: TenantScope,
  ctx: ActorContext,
  params: { bookingId: string; startsAt: Date; staffMemberId?: string },
) {
  authorizeIn(scope, ctx, 'bookings.reschedule');
  const booking = await loadBooking(scope, params.bookingId);
  if (!ACTIVE.includes(booking.status))
    throw new AppError('INVALID_STATE', 'Only active bookings can be moved.');
  const { timezone } = await scope.db.organization.findUniqueOrThrow({
    where: { id: scope.organizationId },
    select: { timezone: true },
  });

  const { slot } = await findExactSlot(scope, {
    serviceId: booking.serviceId,
    startsAt: params.startsAt,
    staffMemberId: params.staffMemberId,
    excludeBookingId: booking.id,
    timeZone: timezone,
  });
  if (!slot) throw new AppError('CONFLICT', 'That time is not available.');

  try {
    await scope.db.booking.update({
      where: { id: booking.id },
      data: {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        staffMemberId: params.staffMemberId ?? slot.staffMemberId,
      },
    });
  } catch (error) {
    if (postgresErrorCode(error) === PG_EXCLUSION_VIOLATION) {
      throw new AppError('CONFLICT', 'That time was just taken. Please choose another.');
    }
    throw error;
  }
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'booking.rescheduled',
    entityType: 'Booking',
    entityId: booking.id,
    metadata: {
      fromStartsAt: booking.startsAt.toISOString(),
      toStartsAt: slot.startsAt.toISOString(),
      staffMemberId: params.staffMemberId ?? slot.staffMemberId,
    },
  });
  return loadBooking(scope, booking.id);
}

/** Public manage-booking page: the token in the link is the only proof of ownership. */
export async function findBookingByManageToken(scope: TenantScope, token: string) {
  if (!token || token.length > 100) return null;
  return scope.db.booking.findFirst({
    where: { organizationId: scope.organizationId, manageTokenHash: hashToken(token) },
    select: {
      id: true,
      reference: true,
      status: true,
      startsAt: true,
      endsAt: true,
      customerId: true,
      service: { select: { name: true, priceMinor: true, priceIsFrom: true } },
      staffMember: { select: { displayName: true } },
    },
  });
}
