import type { Metadata } from 'next';
import { AccessNotice, DemoModeTag, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { addDays, formatDuration, formatInZone, toLocalDate, zonedTimeToUtc } from '@/lib/time';
import { loadAnalytics, type OperationalMetrics } from '@/modules/analytics/metrics';
import { pageAccess } from '@/server/context';
import { FilterTabs, Panel, tableClasses as t } from '../_components/status';
import { ConversationLines, DailyColumns, ServiceBars } from './charts';

export const metadata: Metadata = { title: 'Analytics' };

const RANGES = [7, 30, 90] as const;
const REASONS: Record<string, string> = {
  unanswered_question: 'No reliable answer',
  customer_asked: 'Customer asked for a person',
  no_availability: 'No free times',
  flagged: 'Looked like spam',
  staff_took_over: 'Staff took over',
  automation_rule: 'Automation rule',
};

async function load(days: number) {
  const { dashboard, allowed } = await pageAccess('analytics.view');
  if (!allowed) return null;
  const tz = dashboard.organization.timezone;
  const now = new Date();
  // Whole local days: from midnight `days - 1` days ago until the end of today.
  const today = toLocalDate(now, tz);
  const range = {
    from: zonedTimeToUtc(addDays(today, -(days - 1)), 0, tz),
    to: zonedTimeToUtc(addDays(today, 1), 0, tz),
  };
  const data = await withTenant(dashboard.ctx.organizationId, async (scope) => ({
    analytics: await loadAnalytics(scope, dashboard.ctx, range, tz),
    isDemo: (
      await scope.db.organization.findUniqueOrThrow({
        where: { id: scope.organizationId },
        select: { isDemo: true },
      })
    ).isDemo,
  }));
  return { ...data, tz };
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

function Delta({
  current,
  previous,
  goodWhenUp = true,
}: {
  current: number | null;
  previous: number | null;
  goodWhenUp?: boolean;
}) {
  if (current === null || previous === null || previous === 0)
    return <span className="text-ink-3">no earlier data</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return <span className="text-ink-3">same as before</span>;
  const good = change > 0 === goodWhenUp;
  return (
    <span className={good ? 'text-pine-700' : 'text-danger-700'}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change)}% <span className="text-ink-3">vs previous period</span>
    </span>
  );
}

function tiles(m: OperationalMetrics, p: OperationalMetrics) {
  return [
    {
      label: 'Conversations',
      value: String(m.conversations),
      current: m.conversations,
      previous: p.conversations,
      note: 'with at least one customer message',
    },
    {
      label: 'Handled without a person',
      value:
        pct(m.handledWithoutPerson, m.conversations) === null
          ? '—'
          : `${pct(m.handledWithoutPerson, m.conversations)}%`,
      current: pct(m.handledWithoutPerson, m.conversations),
      previous: pct(p.handledWithoutPerson, p.conversations),
      note: 'never handed over',
    },
    {
      label: 'Bookings made',
      value: String(m.bookingsCreated),
      current: m.bookingsCreated,
      previous: p.bookingsCreated,
      note: `${m.bookingsByOrigin.CHAT} in chat · ${m.bookingsByOrigin.DASHBOARD} at the desk`,
    },
    {
      label: 'Chat booking conversion',
      value:
        pct(m.convertedConversations, m.bookingIntentConversations) === null
          ? '—'
          : `${pct(m.convertedConversations, m.bookingIntentConversations)}%`,
      current: pct(m.convertedConversations, m.bookingIntentConversations),
      previous: pct(p.convertedConversations, p.bookingIntentConversations),
      note: `of ${m.bookingIntentConversations} chats that wanted a time`,
    },
    {
      label: 'Handed to a person',
      value: String(m.handoffs),
      current: m.handoffs,
      previous: p.handoffs,
      goodWhenUp: false,
      note: 'see reasons below',
    },
    {
      label: 'Median first reply',
      value: m.medianFirstReplyMinutes === null ? '—' : formatDuration(m.medianFirstReplyMinutes),
      current: m.medianFirstReplyMinutes,
      previous: p.medianFirstReplyMinutes,
      goodWhenUp: false,
      note: 'from hand-off to a staff reply',
    },
  ];
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const requested = Number((await searchParams).days);
  const days = RANGES.find((r) => r === requested) ?? 30;
  const data = await load(days);
  if (!data) return <AccessNotice what="analytics" />;
  const { metrics, previous, series, services, reasons } = data.analytics;
  const points = series.map((p) => ({
    ...p,
    label: formatInZone(zonedTimeToUtc(p.date, 720, data.tz), data.tz, 'd MMM, EEE'),
  }));
  const runs = metrics.automationRuns.succeeded + metrics.automationRuns.failed;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="How Relay is doing"
        description="Counted straight from this business’s bookings, conversations, leads and automation runs."
        actions={data.isDemo ? <DemoModeTag>Demo data</DemoModeTag> : undefined}
      />

      <FilterTabs
        label="Period"
        tabs={RANGES.map((r) => ({
          href: `/app/analytics?days=${r}`,
          label: `Last ${r} days`,
          active: r === days,
        }))}
      />

      <section
        aria-label="Key figures"
        className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3"
      >
        {tiles(metrics, previous).map((tile) => (
          <div key={tile.label} className="bg-surface px-5 py-4">
            <p className="text-sm text-ink-2">{tile.label}</p>
            <p className="mt-1 text-[2rem] leading-none font-semibold">{tile.value}</p>
            <p className="mt-2 text-xs">
              <Delta current={tile.current} previous={tile.previous} goodWhenUp={tile.goodWhenUp} />
            </p>
            <p className="mt-0.5 text-xs text-ink-3">{tile.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-5">
          <h2 className="text-[0.9375rem] font-semibold">Conversations and hand-offs</h2>
          <p className="mb-4 text-sm text-ink-3">
            Per day. A rising orange line means Relay is missing answers — look at the reasons below.
          </p>
          <ConversationLines points={points} />
        </Panel>
        <Panel className="p-5">
          <h2 className="text-[0.9375rem] font-semibold">Bookings made per day</h2>
          <p className="mb-4 text-sm text-ink-3">
            By the day the booking was made, from the chat and the desk.
          </p>
          <DailyColumns points={points} valueKey="bookings" name="Bookings" />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Panel className="p-5">
          <h2 className="mb-4 text-[0.9375rem] font-semibold">Bookings by service</h2>
          <ServiceBars rows={services} />
        </Panel>
        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="text-[0.9375rem] font-semibold">Why conversations were handed over</h2>
            {reasons.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">No hand-offs in this period.</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {reasons.map((r) => (
                  <li key={r.reason} className="flex justify-between gap-3">
                    <span className="text-ink-2">{REASONS[r.reason] ?? r.reason}</span>
                    <span className="tabular font-mono">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-3">
              “No reliable answer” usually means an FAQ is missing under Setup → Knowledge.
            </p>
          </Panel>
          <Panel className="p-5">
            <h2 className="text-[0.9375rem] font-semibold">Automations</h2>
            <p className="mt-2 text-sm">
              <span className="text-2xl font-semibold">{runs}</span> <span className="text-ink-2">runs</span>
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {metrics.automationRuns.succeeded} succeeded ·{' '}
              <span className={cx(metrics.automationRuns.failed > 0 && 'font-medium text-danger-700')}>
                {metrics.automationRuns.failed} failed
              </span>
            </p>
            <p className="mt-2 text-sm text-ink-2">
              {metrics.leadsCreated} leads came in, {metrics.leadsWon} won · {metrics.cancellations} bookings
              cancelled
            </p>
          </Panel>
        </div>
      </div>

      <details className="rounded-[var(--radius-lg)] border border-rule bg-surface">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
          Show the numbers as a table
        </summary>
        <div className="overflow-x-auto border-t border-rule">
          <table className={t.table}>
            <caption className="sr-only">Daily conversations, hand-offs and bookings</caption>
            <thead>
              <tr>
                <th scope="col" className={t.th}>
                  Day
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Conversations
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Handed over
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Bookings made
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className={t.row}>
                  <td className={t.td}>{p.label}</td>
                  <td className={`${t.td} tabular text-right font-mono`}>{p.conversations}</td>
                  <td className={`${t.td} tabular text-right font-mono`}>{p.handoffs}</td>
                  <td className={`${t.td} tabular text-right font-mono`}>{p.bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
