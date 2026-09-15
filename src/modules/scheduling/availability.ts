import 'server-only';
import type { TenantScope } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { addDays, toLocalDate, zonedTimeToUtc, type LocalDate } from '@/lib/time';
import { findAvailableSlots, type Slot } from './slots';

export interface AvailabilityQuery {
  serviceId: string;
  from: LocalDate;
  to: LocalDate;
  window?: { startMinute: number; endMinute: number };
  /** Only this person. */
  staffMemberId?: string;
  /** Ignore this booking's own time (used when rescheduling it). */
  excludeBookingId?: string;
  now?: Date;
}

/** Loads the organization's rules, staff hours, time off and bookings, then runs the slot finder. */
// #region learn:availability
export async function findSlotsForService(scope: TenantScope, query: AvailabilityQuery) {
  const { db, organizationId } = scope;
  const now = query.now ?? new Date();

  // Queries inside a transaction share one connection, so they run one after another.
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      timezone: true,
      minNoticeMinutes: true,
      bookingHorizonDays: true,
      slotIntervalMinutes: true,
    },
  });
  const service = await db.service.findFirst({
    where: { id: query.serviceId, organizationId, active: true },
  });
  if (!service || service.kind !== 'BOOKABLE' || !service.durationMinutes) {
    throw new AppError('NOT_FOUND', 'That service cannot be booked online.');
  }

  const tz = organization.timezone;
  const rangeStart = zonedTimeToUtc(query.from, 0, tz);
  const rangeEnd = zonedTimeToUtc(addDays(query.to, 1), 0, tz);

  const staff = await db.staffMember.findMany({
    where: {
      organizationId,
      active: true,
      services: { some: { serviceId: service.id } },
      ...(query.staffMemberId ? { id: query.staffMemberId } : {}),
    },
    select: { id: true, sortOrder: true, workingHours: true },
  });
  const staffIds = staff.map((s) => s.id);

  const timeOff = await db.timeOff.findMany({
    where: {
      organizationId,
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
      OR: [{ staffMemberId: null }, { staffMemberId: { in: staffIds } }],
    },
    select: { staffMemberId: true, startsAt: true, endsAt: true },
  });
  const busy = await db.booking.findMany({
    where: {
      organizationId,
      staffMemberId: { in: staffIds },
      status: { in: ['PENDING', 'CONFIRMED'] },
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
      ...(query.excludeBookingId ? { id: { not: query.excludeBookingId } } : {}),
    },
    select: { staffMemberId: true, startsAt: true, endsAt: true },
  });

  const slots: Slot[] = findAvailableSlots({
    timeZone: tz,
    now,
    durationMinutes: service.durationMinutes,
    slotIntervalMinutes: organization.slotIntervalMinutes,
    minNoticeMinutes: organization.minNoticeMinutes,
    horizonDays: organization.bookingHorizonDays,
    from: query.from,
    to: query.to,
    window: query.window,
    staff: staff.map((s) => ({
      id: s.id,
      sortOrder: s.sortOrder,
      hours: s.workingHours.map((h) => ({
        weekday: h.weekday,
        startMinute: h.startMinute,
        endMinute: h.endMinute,
      })),
    })),
    timeOff,
    busy,
  });

  return { service, timeZone: tz, slots };
}
// #endregion learn:availability

/** Re-checks one exact start time with the same rules the customer was shown. */
export async function findExactSlot(
  scope: TenantScope,
  params: {
    serviceId: string;
    startsAt: Date;
    staffMemberId?: string;
    excludeBookingId?: string;
    timeZone: string;
  },
) {
  const date = toLocalDate(params.startsAt, params.timeZone);
  const { service, slots } = await findSlotsForService(scope, {
    serviceId: params.serviceId,
    from: date,
    to: date,
    staffMemberId: params.staffMemberId,
    excludeBookingId: params.excludeBookingId,
  });
  const slot = slots.find((s) => s.startsAt.getTime() === params.startsAt.getTime());
  return { service, slot };
}
