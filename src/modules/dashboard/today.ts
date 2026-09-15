import 'server-only';
import type { TenantScope } from '@/lib/db';
import { addDays, isoWeekday, toLocalDate, zonedTimeToUtc } from '@/lib/time';
import { computeMetrics } from '@/modules/analytics/metrics';
import { authorizeIn, isAllowed, type MemberContext } from '@/modules/tenancy/context';

/** Everything the "Today" page shows, loaded in one tenant-scoped transaction. */
export async function loadToday(scope: TenantScope, ctx: MemberContext, now: Date) {
  authorizeIn(scope, ctx, 'bookings.view');
  const { db, organizationId } = scope;
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, timezone: true, isDemo: true, slug: true },
  });
  const tz = organization.timezone;
  const today = toLocalDate(now, tz);
  const dayStart = zonedTimeToUtc(today, 0, tz);
  const dayEnd = zonedTimeToUtc(addDays(today, 1), 0, tz);
  const weekday = isoWeekday(today);

  const staff = await db.staffMember.findMany({
    where: { organizationId, active: true },
    orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    select: {
      id: true,
      displayName: true,
      title: true,
      workingHours: { where: { weekday }, select: { startMinute: true, endMinute: true } },
    },
  });
  const bookings = await db.booking.findMany({
    where: {
      organizationId,
      startsAt: { gte: dayStart, lt: dayEnd },
      status: { in: ['CONFIRMED', 'PENDING'] },
    },
    orderBy: { startsAt: 'asc' },
    include: {
      service: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });
  const timeOff = await db.timeOff.findMany({
    where: { organizationId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
    select: { staffMemberId: true, reason: true },
  });

  const waiting = await db.conversation.findMany({
    where: { organizationId, status: 'NEEDS_HUMAN' },
    orderBy: { handedOffAt: 'asc' },
    take: 5,
    include: {
      customer: { select: { name: true } },
      assignee: { select: { user: { select: { name: true } } } },
      messages: {
        where: { author: 'CUSTOMER' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { body: true },
      },
    },
  });
  const pendingApprovals = await db.booking.findMany({
    where: { organizationId, status: 'PENDING', startsAt: { gte: now } },
    orderBy: { startsAt: 'asc' },
    take: 5,
    include: { service: { select: { name: true } }, customer: { select: { name: true } } },
  });
  const myTasks = await db.task.findMany({
    where: { organizationId, status: 'OPEN', OR: [{ assigneeId: ctx.membershipId }, { assigneeId: null }] },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
    take: 6,
    select: {
      id: true,
      title: true,
      dueAt: true,
      kind: true,
      assigneeId: true,
      conversationId: true,
      bookingId: true,
    },
  });

  const week = isAllowed(ctx, 'analytics.view')
    ? await computeMetrics(scope, { from: new Date(now.getTime() - 7 * 24 * 3_600_000), to: now })
    : null;

  return {
    organization,
    today,
    dayStart,
    staff,
    bookings,
    timeOff,
    waiting,
    pendingApprovals,
    myTasks,
    week,
  };
}
