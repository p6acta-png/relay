import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessNotice, Badge, FormMessage } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { formatInZone, toLocalDate } from '@/lib/time';
import { listAuditForEntity } from '@/modules/audit/audit';
import { formatPrice } from '@/modules/conversations/flow';
import { getBooking } from '@/modules/scheduling/bookings';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import { BookingStatusBadge, Panel } from '../../_components/status';
import { BookingActions } from './booking-actions';

export const metadata: Metadata = { title: 'Booking' };

async function load(id: string) {
  const { dashboard, allowed } = await pageAccess('bookings.view');
  if (!allowed) return { denied: true as const };
  try {
    return await withTenant(dashboard.ctx.organizationId, async (scope) => {
      const booking = await getBooking(scope, dashboard.ctx, id);
      const history = isAllowed(dashboard.ctx, 'audit.view')
        ? await listAuditForEntity(scope, 'Booking', id)
        : null;
      return { dashboard, booking, history, now: new Date() };
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const data = await load(id);
  if (data === null) notFound();
  if ('denied' in data) return <AccessNotice what="bookings" />;
  const { dashboard, booking, history, now } = data;
  const tz = dashboard.organization.timezone;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/app/bookings" className="text-sm text-ink-2 hover:text-ink">
        ← Bookings
      </Link>
      {created && (
        <FormMessage tone="success">Booking created. The confirmation is in the email outbox.</FormMessage>
      )}

      <header className="flex flex-col gap-3 border-b border-rule pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Booking · {booking.reference}</p>
          <h1 className="mt-2 text-[1.625rem] leading-tight font-semibold">{booking.service.name}</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-2">
            {formatInZone(booking.startsAt, tz, 'EEEE d MMMM, HH:mm')}–
            {formatInZone(booking.endsAt, tz, 'HH:mm')} with {booking.staffMember.displayName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BookingStatusBadge status={booking.status} />
          <Badge tone={booking.origin === 'CHAT' ? 'pine' : 'outline'}>
            {booking.origin === 'CHAT'
              ? 'Booked in chat'
              : booking.origin === 'EMAIL'
                ? 'From email'
                : 'Booked at the desk'}
          </Badge>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && booking.endsAt > now && (
            <BookingActions
              bookingId={booking.id}
              serviceId={booking.serviceId}
              status={booking.status}
              date={toLocalDate(booking.startsAt, tz)}
              today={toLocalDate(now, tz)}
              can={{
                decide: isAllowed(dashboard.ctx, 'bookings.decide'),
                cancel: isAllowed(dashboard.ctx, 'bookings.cancel'),
                reschedule: isAllowed(dashboard.ctx, 'bookings.reschedule'),
              }}
            />
          )}
          {booking.cancellationReason && (
            <Panel className="p-4 text-sm">
              <p className="eyebrow">
                {booking.status === 'DECLINED' ? 'Reason for declining' : 'Cancellation note'}
              </p>
              <p className="mt-1">{booking.cancellationReason}</p>
            </Panel>
          )}
          {booking.notes && (
            <Panel className="p-4 text-sm">
              <p className="eyebrow">Notes</p>
              <p className="mt-1 whitespace-pre-wrap">{booking.notes}</p>
            </Panel>
          )}

          <section aria-labelledby="history-title">
            <h2 id="history-title" className="mb-3 text-[0.9375rem] font-semibold">
              What happened
            </h2>
            {history === null ? (
              <p className="text-sm text-ink-3">The detailed history is visible to owners and admins.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-rule pl-5">
                {history.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-paper ${entry.result === 'SUCCESS' ? 'bg-pine-600' : 'bg-danger-600'}`}
                      aria-hidden
                    />
                    <p className="text-sm">
                      <span className="font-mono text-[0.8125rem]">{entry.action}</span>{' '}
                      <span className="text-ink-2">by {entry.actorLabel}</span>
                    </p>
                    <p className="font-mono text-[0.6875rem] text-ink-3">
                      {formatInZone(entry.createdAt, tz, 'd MMM yyyy, HH:mm:ss')}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <h2 className="eyebrow">Customer</h2>
            <p className="mt-2 text-sm font-medium">{booking.customer.name ?? 'Anonymised'}</p>
            {booking.customer.email && <p className="text-sm text-ink-2">{booking.customer.email}</p>}
            {booking.customer.phone && (
              <p className="tabular font-mono text-[0.8125rem] text-ink-2">{booking.customer.phone}</p>
            )}
            <Link
              href={`/app/customers/${booking.customer.id}`}
              className="mt-2 inline-block text-xs text-pine-700 hover:underline"
            >
              Customer history →
            </Link>
          </Panel>
          <Panel className="p-4 text-sm">
            <h2 className="eyebrow">Details</h2>
            <dl className="mt-2 space-y-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Price</dt>
                <dd className="tabular">{formatPrice(booking.service) ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Duration</dt>
                <dd>{booking.service.durationMinutes} min</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Created</dt>
                <dd>{formatInZone(booking.createdAt, tz, 'd MMM, HH:mm')}</dd>
              </div>
            </dl>
            {booking.conversation && (
              <Link
                href={`/app/inbox/${booking.conversation.id}`}
                className="mt-3 inline-block text-xs text-pine-700 hover:underline"
              >
                Open the conversation →
              </Link>
            )}
          </Panel>
          {booking.tasks.length > 0 && (
            <Panel className="p-4 text-sm">
              <h2 className="eyebrow">Tasks</h2>
              <ul className="mt-2 space-y-1">
                {booking.tasks.map((task) => (
                  <li key={task.id} className={task.status === 'DONE' ? 'text-ink-3 line-through' : ''}>
                    {task.title}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
