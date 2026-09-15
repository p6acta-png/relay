import type { Metadata } from 'next';
import Link from 'next/link';
import type { BookingStatus } from '@/generated/prisma/enums';
import { ButtonLink } from '@/components/ui/button';
import { AccessNotice, Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { addDays, formatInZone, toLocalDate, zonedTimeToUtc } from '@/lib/time';
import { listBookings } from '@/modules/scheduling/bookings';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import { BookingStatusBadge, FilterTabs, tableClasses as t } from '../_components/status';

export const metadata: Metadata = { title: 'Bookings' };

type View = 'day' | 'upcoming' | 'pending' | 'cancelled';

async function load(view: View, requestedDate: string | undefined) {
  const { dashboard, allowed } = await pageAccess('bookings.view');
  if (!allowed) return null;
  const tz = dashboard.organization.timezone;
  const now = new Date();
  const today = toLocalDate(now, tz);
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;

  const query: { from: Date; to: Date; status?: BookingStatus[] } =
    view === 'day'
      ? { from: zonedTimeToUtc(date, 0, tz), to: zonedTimeToUtc(addDays(date, 1), 0, tz) }
      : view === 'pending'
        ? { from: now, to: zonedTimeToUtc(addDays(today, 120), 0, tz), status: ['PENDING'] }
        : view === 'cancelled'
          ? {
              from: zonedTimeToUtc(addDays(today, -30), 0, tz),
              to: zonedTimeToUtc(addDays(today, 60), 0, tz),
              status: ['CANCELLED', 'DECLINED'],
            }
          : { from: now, to: zonedTimeToUtc(addDays(today, 15), 0, tz), status: ['CONFIRMED', 'PENDING'] };

  const { bookings, pendingCount } = await withTenant(dashboard.ctx.organizationId, async (scope) => ({
    bookings: await listBookings(scope, dashboard.ctx, query),
    pendingCount: await scope.db.booking.count({
      where: { organizationId: scope.organizationId, status: 'PENDING', startsAt: { gte: now } },
    }),
  }));
  return { dashboard, bookings, pendingCount, tz, date, today, now };
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const view: View =
    (['day', 'upcoming', 'pending', 'cancelled'] as const).find((v) => v === params.view) ?? 'day';
  const data = await load(view, params.date);
  if (!data) return <AccessNotice what="bookings" />;
  const { bookings, tz, date, today, now } = data;

  const grouped = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const key =
      view === 'day' ? booking.staffMember.displayName : formatInZone(booking.startsAt, tz, 'EEEE d MMMM');
    grouped.set(key, [...(grouped.get(key) ?? []), booking]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bookings"
        title={view === 'day' ? formatInZone(zonedTimeToUtc(date, 720, tz), tz, 'EEEE d MMMM') : 'Bookings'}
        description="Every booking, whether it came from the chat, an email or someone at the desk."
        actions={
          isAllowed(data.dashboard.ctx, 'bookings.create') && (
            <ButtonLink href="/app/bookings/new" size="sm">
              New booking
            </ButtonLink>
          )
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterTabs
          label="Booking views"
          tabs={[
            { href: '/app/bookings?view=day', label: 'Day', active: view === 'day' },
            { href: '/app/bookings?view=upcoming', label: 'Next 14 days', active: view === 'upcoming' },
            {
              href: '/app/bookings?view=pending',
              label: 'Needs approval',
              active: view === 'pending',
              count: data.pendingCount,
              urgent: true,
            },
            {
              href: '/app/bookings?view=cancelled',
              label: 'Cancelled & declined',
              active: view === 'cancelled',
            },
          ]}
        />
        {view === 'day' && (
          <nav aria-label="Change day" className="flex items-center gap-1 text-sm">
            <Link
              href={`/app/bookings?view=day&date=${addDays(date, -1)}`}
              className="rounded-[var(--radius-md)] px-2.5 py-1.5 hover:bg-sunken"
            >
              ← Previous
            </Link>
            {date !== today && (
              <Link
                href="/app/bookings?view=day"
                className="rounded-[var(--radius-md)] px-2.5 py-1.5 hover:bg-sunken"
              >
                Today
              </Link>
            )}
            <Link
              href={`/app/bookings?view=day&date=${addDays(date, 1)}`}
              className="rounded-[var(--radius-md)] px-2.5 py-1.5 hover:bg-sunken"
            >
              Next →
            </Link>
          </nav>
        )}
      </div>

      {bookings.length === 0 ? (
        <EmptyState title={view === 'pending' ? 'Nothing waiting for approval' : 'No bookings here'}>
          {view === 'day'
            ? 'No bookings on this day yet.'
            : 'Bookings from the chat and the dashboard will show up here.'}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {[...grouped].map(([group, rows]) => (
            <section key={group} aria-labelledby={`g-${group}`}>
              <h2 id={`g-${group}`} className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                {group}
                <span className="font-mono text-xs font-normal text-ink-3">{rows.length}</span>
              </h2>
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface">
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={t.th}>
                        {view === 'day' ? 'Time' : 'When'}
                      </th>
                      <th scope="col" className={t.th}>
                        Service
                      </th>
                      <th scope="col" className={t.th}>
                        Customer
                      </th>
                      <th scope="col" className={t.th}>
                        {view === 'day' ? 'Status' : 'With'}
                      </th>
                      <th scope="col" className={cx(t.th, 'text-right')}>
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((booking) => (
                      <tr
                        key={booking.id}
                        className={cx(
                          t.row,
                          booking.endsAt < now && booking.status === 'CONFIRMED' && 'text-ink-3',
                        )}
                      >
                        <td className={cx(t.td, 'tabular font-mono text-[0.8125rem] whitespace-nowrap')}>
                          <Link href={`/app/bookings/${booking.id}`} className="hover:underline">
                            {formatInZone(booking.startsAt, tz, 'HH:mm')}–
                            {formatInZone(booking.endsAt, tz, 'HH:mm')}
                          </Link>
                        </td>
                        <td className={t.td}>
                          <Link href={`/app/bookings/${booking.id}`} className="font-medium hover:underline">
                            {booking.service.name}
                          </Link>
                          <span className="block font-mono text-[0.6875rem] text-ink-3">
                            {booking.reference}
                          </span>
                        </td>
                        <td className={t.td}>{booking.customer.name ?? 'Anonymised'}</td>
                        <td className={t.td}>
                          {view === 'day' ? (
                            <BookingStatusBadge status={booking.status} />
                          ) : (
                            booking.staffMember.displayName
                          )}
                          {view !== 'day' && booking.status !== 'CONFIRMED' && (
                            <span className="ml-2">
                              <BookingStatusBadge status={booking.status} />
                            </span>
                          )}
                        </td>
                        <td className={cx(t.td, 'text-right')}>
                          <Badge tone={booking.origin === 'CHAT' ? 'pine' : 'outline'}>
                            {booking.origin === 'CHAT'
                              ? 'Chat'
                              : booking.origin === 'EMAIL'
                                ? 'Email'
                                : 'Desk'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
