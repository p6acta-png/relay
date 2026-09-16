import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { IconArrowRight, IconHandoff } from '@/components/ui/icons';
import { Badge, EmptyState } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { formatDuration, formatInZone, formatRelative, localMinutesOfDay, minutesToTime } from '@/lib/time';
import { previewCustomerMessage } from '@/modules/conversations/model';
import { loadToday } from '@/modules/dashboard/today';
import { requireDashboard } from '@/server/context';
import { Panel, SectionHeading } from '../_components/status';

export const metadata: Metadata = { title: 'Today' };

const HOUR_PX = 56;

async function load() {
  const dashboard = await requireDashboard();
  const now = new Date();
  const data = await withTenant(dashboard.ctx.organizationId, (scope) =>
    loadToday(scope, dashboard.ctx, now),
  );
  return { dashboard, data, now };
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [{ dashboard, data, now }, { welcome }] = await Promise.all([load(), searchParams]);
  const tz = data.organization.timezone;
  const firstName = dashboard.session.user.name.split(' ')[0];

  // Visible hours: the earliest start to the latest end among today's working staff.
  const ranges = data.staff.flatMap((s) => s.workingHours);
  const startHour = ranges.length ? Math.floor(Math.min(...ranges.map((r) => r.startMinute)) / 60) : 8;
  const endHour = ranges.length ? Math.ceil(Math.max(...ranges.map((r) => r.endMinute)) / 60) : 17;
  const nowMinute = localMinutesOfDay(now, tz);
  const working = data.staff.filter((s) => s.workingHours.length > 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{formatInZone(now, tz, 'EEEE d MMMM')}</p>
          <h1 className="mt-2 text-[1.625rem] leading-tight font-semibold">
            {welcome
              ? `Welcome to Relay, ${firstName}`
              : `Good ${nowMinute < 720 ? 'morning' : nowMinute < 1080 ? 'afternoon' : 'evening'}, ${firstName}`}
          </h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-2">
            {data.bookings.length} booking{data.bookings.length === 1 ? '' : 's'} today
            {data.waiting.length > 0 && (
              <>
                {' · '}
                <Link
                  href="/app/inbox?filter=needs_human"
                  className="font-medium text-signal-700 underline-offset-2 hover:underline"
                >
                  {data.waiting.length} {data.waiting.length === 1 ? 'customer is' : 'customers are'} waiting
                  for a person
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/w/${data.organization.slug}`} variant="secondary" size="sm" target="_blank">
            Open public page
          </ButtonLink>
          <ButtonLink href="/app/bookings/new" size="sm">
            New booking
          </ButtonLink>
        </div>
      </header>

      {welcome && (
        <Panel className="border-pine-600/25 bg-pine-50 p-4 text-sm text-pine-800">
          Your business is set up. Relay can already take bookings on your public page. Next: add your team
          and a few answers to common questions under{' '}
          <Link href="/app/setup" className="font-medium underline">
            Setup
          </Link>
          .
        </Panel>
      )}

      {data.week && (
        <section aria-labelledby="week-title">
          <h2 id="week-title" className="sr-only">
            Last 7 days
          </h2>
          <dl className="grid grid-cols-2 divide-rule rounded-[var(--radius-lg)] border border-rule bg-surface sm:grid-cols-4 sm:divide-x">
            {[
              {
                label: 'Bookings made',
                value: String(data.week.bookingsCreated),
                note: `${data.week.bookingsByOrigin.CHAT} through the chat`,
              },
              {
                label: 'Handled without a person',
                value: data.week.conversations
                  ? `${Math.round((data.week.handledWithoutPerson / data.week.conversations) * 100)} %`
                  : '—',
                note: `of ${data.week.conversations} conversations`,
              },
              {
                label: 'Handed to the team',
                value: String(data.week.handoffs),
                note: 'questions Relay couldn’t answer',
              },
              {
                label: 'Median first reply',
                value:
                  data.week.medianFirstReplyMinutes === null
                    ? '—'
                    : formatDuration(data.week.medianFirstReplyMinutes),
                note: 'after a hand-off',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="border-rule px-4 py-3.5 max-sm:odd:border-r max-sm:[&:nth-child(-n+2)]:border-b"
              >
                <dt className="eyebrow">{item.label}</dt>
                <dd className="tabular mt-1.5 text-2xl font-semibold">{item.value}</dd>
                <dd className="text-xs text-ink-3">{item.note} · 7 days</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="board-title" className="min-w-0">
          <SectionHeading
            title="Today’s workshop"
            action={
              <Link
                href="/app/bookings"
                className="flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
              >
                All bookings <IconArrowRight className="size-4" />
              </Link>
            }
          >
            <span id="board-title">Bookings per person, in {tz.split('/')[1]} time.</span>
          </SectionHeading>

          {working.length === 0 ? (
            <EmptyState title="Nobody is working today">
              The workshop is closed, so Relay won’t offer times today.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface">
              <div className="flex min-w-[36rem]">
                <div className="w-14 shrink-0 border-r border-rule pt-10" aria-hidden>
                  {Array.from({ length: endHour - startHour }, (_, i) => (
                    <div
                      key={i}
                      className="relative font-mono text-[0.625rem] text-ink-3"
                      style={{ height: HOUR_PX }}
                    >
                      <span className="absolute -top-2 right-2">
                        {String(startHour + i).padStart(2, '0')}:00
                      </span>
                    </div>
                  ))}
                </div>
                {working.map((member) => {
                  const own = data.bookings.filter((b) => b.staffMemberId === member.id);
                  const off = data.timeOff.find(
                    (t) => t.staffMemberId === member.id || t.staffMemberId === null,
                  );
                  return (
                    <div key={member.id} className="min-w-40 flex-1 border-r border-rule last:border-r-0">
                      <div className="flex h-10 items-center justify-between gap-2 border-b border-rule px-3">
                        <span className="truncate text-sm font-medium">{member.displayName}</span>
                        <span className="tabular font-mono text-[0.625rem] text-ink-3">
                          {member.workingHours
                            .map((h) => `${minutesToTime(h.startMinute)}–${minutesToTime(h.endMinute)}`)
                            .join(', ')}
                        </span>
                      </div>
                      <div className="relative" style={{ height: (endHour - startHour) * HOUR_PX }}>
                        {Array.from({ length: endHour - startHour }, (_, i) => (
                          <div
                            key={i}
                            className="border-b border-dashed border-rule/60"
                            style={{ height: HOUR_PX }}
                            aria-hidden
                          />
                        ))}
                        {/* Outside working hours is shaded */}
                        {member.workingHours.map((h) => (
                          <div
                            key={h.startMinute}
                            className="absolute inset-x-0 -z-0 bg-white/60"
                            style={{
                              top: ((h.startMinute - startHour * 60) / 60) * HOUR_PX,
                              height: ((h.endMinute - h.startMinute) / 60) * HOUR_PX,
                            }}
                            aria-hidden
                          />
                        ))}
                        {off && (
                          <div className="absolute inset-x-2 top-2 rounded-[var(--radius-sm)] bg-sunken px-2 py-1 text-xs text-ink-2">
                            Away: {off.reason ?? 'time off'}
                          </div>
                        )}
                        {own.map((booking) => {
                          const start = localMinutesOfDay(booking.startsAt, tz);
                          const minutes = (booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000;
                          return (
                            <Link
                              key={booking.id}
                              href={`/app/bookings/${booking.id}`}
                              className={cx(
                                'absolute inset-x-1.5 overflow-hidden rounded-[var(--radius-sm)] border-l-[3px] px-2 py-1 text-xs leading-tight transition-colors',
                                booking.status === 'PENDING'
                                  ? 'border-pending-700 bg-pending-50 hover:bg-pending-50/70'
                                  : booking.endsAt < now
                                    ? 'border-rule-strong bg-sunken text-ink-2 hover:bg-sunken/70'
                                    : 'border-pine-600 bg-pine-50 hover:bg-pine-100',
                              )}
                              style={{
                                top: ((start - startHour * 60) / 60) * HOUR_PX + 1,
                                height: Math.max(22, (minutes / 60) * HOUR_PX - 2),
                              }}
                            >
                              <span className="tabular font-mono text-[0.625rem] text-ink-2">
                                {formatInZone(booking.startsAt, tz, 'HH:mm')}
                              </span>{' '}
                              <span className="font-medium">{booking.service.name}</span>
                              {minutes >= 45 && (
                                <span className="block truncate text-ink-2">
                                  {booking.customer.name ?? 'Customer'}
                                </span>
                              )}
                              <span className="sr-only">
                                {booking.status === 'PENDING' ? ', needs approval' : ''}
                              </span>
                            </Link>
                          );
                        })}
                        {nowMinute >= startHour * 60 && nowMinute <= endHour * 60 && (
                          <div
                            className="pointer-events-none absolute inset-x-0 border-t-2 border-signal-500"
                            style={{ top: ((nowMinute - startHour * 60) / 60) * HOUR_PX }}
                            aria-hidden
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="waiting-title">
            <SectionHeading title="Waiting for a person" />
            <h2 id="waiting-title" className="sr-only">
              Waiting for a person
            </h2>
            {data.waiting.length === 0 ? (
              <p className="rounded-[var(--radius-lg)] border border-dashed border-rule-strong px-4 py-5 text-sm text-ink-3">
                Nobody is waiting. Relay is handling the conversations.
              </p>
            ) : (
              <ul className="divide-y divide-rule rounded-[var(--radius-lg)] border border-signal-500/30 bg-surface">
                {data.waiting.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/app/inbox/${conversation.id}`}
                      className="block px-4 py-3 hover:bg-sunken/40"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <IconHandoff className="size-3.5 text-signal-700" />
                          {conversation.customer?.name ?? 'Website visitor'}
                        </span>
                        <span className="font-mono text-[0.6875rem] text-ink-3">
                          {conversation.handedOffAt ? formatRelative(conversation.handedOffAt, now, tz) : ''}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm text-ink-2">
                        {previewCustomerMessage(conversation.messages)}
                      </span>
                      {conversation.assignee && (
                        <span className="mt-1 block text-xs text-ink-3">
                          Assigned to {conversation.assignee.user.name}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.pendingApprovals.length > 0 && (
            <section>
              <SectionHeading title="Needs approval" />
              <ul className="divide-y divide-rule rounded-[var(--radius-lg)] border border-rule bg-surface">
                {data.pendingApprovals.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/app/bookings/${booking.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sunken/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{booking.service.name}</span>
                        <span className="block text-xs text-ink-3">
                          {booking.customer.name} · {formatInZone(booking.startsAt, tz, 'EEE d MMM, HH:mm')}
                        </span>
                      </span>
                      <Badge tone="pending">Decide</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionHeading
              title="Open tasks"
              action={
                <Link href="/app/tasks" className="text-sm text-ink-2 hover:text-ink">
                  All tasks
                </Link>
              }
            />
            {data.myTasks.length === 0 ? (
              <p className="text-sm text-ink-3">No open tasks for you.</p>
            ) : (
              <ul className="space-y-2">
                {data.myTasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-3 text-sm">
                    <Link
                      href={
                        task.conversationId
                          ? `/app/inbox/${task.conversationId}`
                          : task.bookingId
                            ? `/app/bookings/${task.bookingId}`
                            : '/app/tasks'
                      }
                      className="hover:underline"
                    >
                      {task.title}
                    </Link>
                    {task.dueAt && (
                      <span
                        className={cx(
                          'shrink-0 font-mono text-[0.6875rem]',
                          task.dueAt < now ? 'text-danger-700' : 'text-ink-3',
                        )}
                      >
                        {task.dueAt < now ? 'overdue' : formatInZone(task.dueAt, tz, 'EEE HH:mm')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
