import 'server-only';
import type { TenantScope } from '@/lib/db';
import { authorizeIn, type ActorContext } from '@/modules/tenancy/context';

/**
 * Operational metrics, computed directly from the business's own rows.
 * Nothing is pre-aggregated or estimated: every number can be traced back to bookings,
 * conversations, leads and automation runs in the same database.
 */
export interface MetricsRange {
  from: Date;
  to: Date;
}

export interface OperationalMetrics {
  conversations: number;
  handledWithoutPerson: number;
  handoffs: number;
  bookingIntentConversations: number;
  convertedConversations: number;
  bookingsCreated: number;
  bookingsByOrigin: { CHAT: number; DASHBOARD: number; EMAIL: number };
  cancellations: number;
  leadsCreated: number;
  leadsWon: number;
  medianFirstReplyMinutes: number | null;
  automationRuns: { succeeded: number; failed: number };
}

// #region learn:metrics
export async function computeMetrics(scope: TenantScope, range: MetricsRange): Promise<OperationalMetrics> {
  const { db, organizationId } = scope;
  const { from, to } = range;

  // Only conversations where a customer actually wrote something count.
  const [conversationStats] = await db.$queryRaw<
    { conversations: number; without_person: number; booking_intent: number; converted: number }[]
  >`
    SELECT
      count(*)::int AS conversations,
      count(*) FILTER (WHERE c."handedOffAt" IS NULL)::int AS without_person,
      count(*) FILTER (WHERE c."hadBookingIntent")::int AS booking_intent,
      count(*) FILTER (WHERE c."hadBookingIntent" AND EXISTS (
        SELECT 1 FROM "Booking" b WHERE b."conversationId" = c.id AND b."organizationId" = c."organizationId"
      ))::int AS converted
    FROM "Conversation" c
    WHERE c."organizationId" = ${organizationId}::uuid
      AND c."createdAt" >= ${from} AND c."createdAt" < ${to}
      AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id AND m.author = 'CUSTOMER')`;

  const [handoffStats] = await db.$queryRaw<{ handoffs: number; median_minutes: number | null }[]>`
    SELECT
      count(*)::int AS handoffs,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM ("firstStaffReplyAt" - "handedOffAt")) / 60
      ) FILTER (WHERE "firstStaffReplyAt" IS NOT NULL) AS median_minutes
    FROM "Conversation"
    WHERE "organizationId" = ${organizationId}::uuid
      AND "handedOffAt" >= ${from} AND "handedOffAt" < ${to}`;

  const origins = await db.booking.groupBy({
    by: ['origin'],
    where: { organizationId, createdAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  const cancellations = await db.booking.count({
    where: { organizationId, status: 'CANCELLED', cancelledAt: { gte: from, lt: to } },
  });
  const leadsCreated = await db.lead.count({ where: { organizationId, createdAt: { gte: from, lt: to } } });
  const leadsWon = await db.lead.count({
    where: { organizationId, status: 'WON', closedAt: { gte: from, lt: to } },
  });
  const runs = await db.automationRun.groupBy({
    by: ['status'],
    where: { organizationId, startedAt: { gte: from, lt: to } },
    _count: { _all: true },
  });

  const byOrigin = { CHAT: 0, DASHBOARD: 0, EMAIL: 0 };
  for (const row of origins) byOrigin[row.origin] = row._count._all;

  return {
    conversations: conversationStats?.conversations ?? 0,
    handledWithoutPerson: conversationStats?.without_person ?? 0,
    handoffs: handoffStats?.handoffs ?? 0,
    bookingIntentConversations: conversationStats?.booking_intent ?? 0,
    convertedConversations: conversationStats?.converted ?? 0,
    bookingsCreated: byOrigin.CHAT + byOrigin.DASHBOARD + byOrigin.EMAIL,
    bookingsByOrigin: byOrigin,
    cancellations,
    leadsCreated,
    leadsWon,
    medianFirstReplyMinutes:
      handoffStats?.median_minutes === null || handoffStats?.median_minutes === undefined
        ? null
        : Number(handoffStats.median_minutes),
    automationRuns: {
      succeeded: runs.find((r) => r.status === 'SUCCEEDED')?._count._all ?? 0,
      failed: runs.find((r) => r.status === 'FAILED')?._count._all ?? 0,
    },
  };
}
// #endregion learn:metrics

export interface DailyPoint {
  date: string;
  conversations: number;
  bookings: number;
  handoffs: number;
}

/** One row per local calendar day in the business's time zone, including empty days. */
export async function dailySeries(
  scope: TenantScope,
  range: MetricsRange,
  timeZone: string,
): Promise<DailyPoint[]> {
  const { db, organizationId } = scope;
  const rows = await db.$queryRaw<DailyPoint[]>`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${range.from}::timestamptz AT TIME ZONE ${timeZone}),
        date_trunc('day', (${range.to}::timestamptz - interval '1 second') AT TIME ZONE ${timeZone}),
        interval '1 day'
      )::date AS day
    ),
    convs AS (
      SELECT (c."createdAt" AT TIME ZONE ${timeZone})::date AS day, count(*)::int AS n
      FROM "Conversation" c
      WHERE c."organizationId" = ${organizationId}::uuid AND c."createdAt" >= ${range.from} AND c."createdAt" < ${range.to}
        AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id AND m.author = 'CUSTOMER')
      GROUP BY 1
    ),
    books AS (
      SELECT ("createdAt" AT TIME ZONE ${timeZone})::date AS day, count(*)::int AS n
      FROM "Booking" WHERE "organizationId" = ${organizationId}::uuid AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to}
      GROUP BY 1
    ),
    hands AS (
      SELECT ("handedOffAt" AT TIME ZONE ${timeZone})::date AS day, count(*)::int AS n
      FROM "Conversation" WHERE "organizationId" = ${organizationId}::uuid AND "handedOffAt" >= ${range.from} AND "handedOffAt" < ${range.to}
      GROUP BY 1
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
           COALESCE(convs.n, 0) AS conversations,
           COALESCE(books.n, 0) AS bookings,
           COALESCE(hands.n, 0) AS handoffs
    FROM days
    LEFT JOIN convs ON convs.day = days.day
    LEFT JOIN books ON books.day = days.day
    LEFT JOIN hands ON hands.day = days.day
    ORDER BY days.day`;
  return rows;
}

export interface ServiceBreakdown {
  serviceId: string;
  name: string;
  bookings: number;
  viaChat: number;
}

export async function bookingsByService(
  scope: TenantScope,
  range: MetricsRange,
): Promise<ServiceBreakdown[]> {
  const { db, organizationId } = scope;
  return db.$queryRaw<ServiceBreakdown[]>`
    SELECT s.id AS "serviceId", s.name,
           count(b.id)::int AS bookings,
           count(b.id) FILTER (WHERE b.origin = 'CHAT')::int AS "viaChat"
    FROM "Service" s
    LEFT JOIN "Booking" b ON b."serviceId" = s.id AND b."organizationId" = s."organizationId"
      AND b."createdAt" >= ${range.from} AND b."createdAt" < ${range.to}
    WHERE s."organizationId" = ${organizationId}::uuid AND s.kind = 'BOOKABLE'
    GROUP BY s.id, s.name, s."sortOrder"
    ORDER BY bookings DESC, s."sortOrder"`;
}

/** Topics Relay handed over most often — the gaps worth adding to the knowledge base. */
export async function handoffReasons(scope: TenantScope, range: MetricsRange) {
  const { db, organizationId } = scope;
  return db.$queryRaw<{ reason: string; count: number }[]>`
    SELECT COALESCE(metadata->>'reason', 'unknown') AS reason, count(*)::int AS count
    FROM "AuditLog"
    WHERE "organizationId" = ${organizationId}::uuid AND action = 'conversation.handed_off'
      AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to}
    GROUP BY 1 ORDER BY 2 DESC`;
}

export async function loadAnalytics(
  scope: TenantScope,
  ctx: ActorContext,
  range: MetricsRange,
  timeZone: string,
) {
  authorizeIn(scope, ctx, 'analytics.view');
  const previousRange = {
    from: new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime())),
    to: range.from,
  };
  const metrics = await computeMetrics(scope, range);
  const previous = await computeMetrics(scope, previousRange);
  const series = await dailySeries(scope, range, timeZone);
  const services = await bookingsByService(scope, range);
  const reasons = await handoffReasons(scope, range);
  return { metrics, previous, series, services, reasons };
}
