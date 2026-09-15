import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { formatInZone } from '@/lib/time';
import { formatPrice } from '@/modules/conversations/flow';
import { findBookingByManageToken } from '@/modules/scheduling/bookings';
import { getPublicOrganization } from '@/modules/tenancy/organizations';
import { CancelBookingForm } from './cancel-form';

export const metadata: Metadata = { title: 'Your booking', robots: { index: false, follow: false } };

const STATUS: Record<string, { label: string; tone: 'pine' | 'pending' | 'danger' | 'neutral' }> = {
  CONFIRMED: { label: 'Confirmed', tone: 'pine' },
  PENDING: { label: 'Waiting for confirmation', tone: 'pending' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  DECLINED: { label: 'Declined', tone: 'danger' },
};

/** Loads the booking and applies the cancellation rule at request time (kept out of rendering). */
async function loadBooking(slug: string, token: string) {
  const organization = await getPublicOrganization(slug);
  if (!organization) return null;
  const booking = await withTenant(organization.id, (scope) => findBookingByManageToken(scope, token));
  if (!booking) return null;
  const hoursUntil = (booking.startsAt.getTime() - Date.now()) / 3_600_000;
  const active = booking.status === 'CONFIRMED' || booking.status === 'PENDING';
  return {
    organization,
    booking,
    active,
    canCancel: active && hoursUntil >= organization.cancellationWindowHours,
  };
}

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const view = await loadBooking(slug, token);
  if (!view) notFound();
  const { organization, booking, active, canCancel } = view;
  const tz = organization.timezone;
  const status = STATUS[booking.status]!;

  return (
    <div className="min-h-dvh px-5 py-8 sm:px-8">
      <Link href={`/w/${organization.slug}`} className="font-serif text-2xl tracking-tight">
        {organization.name}
      </Link>
      <main className="mx-auto mt-14 max-w-lg">
        <p className="eyebrow">Your booking · {booking.reference}</p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">{booking.service.name}</h1>
        <div className="mt-3">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>

        <dl className="mt-8 divide-y divide-rule border-y border-rule text-[0.9375rem]">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-ink-3">When</dt>
            <dd className="text-right">{formatInZone(booking.startsAt, tz, "EEEE d MMMM 'at' HH:mm")}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-ink-3">With</dt>
            <dd>{booking.staffMember.displayName}</dd>
          </div>
          {formatPrice(booking.service) && (
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-ink-3">Price</dt>
              <dd className="tabular">{formatPrice(booking.service)}</dd>
            </div>
          )}
          {(organization.addressLine || organization.city) && (
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-ink-3">Where</dt>
              <dd>{[organization.addressLine, organization.city].filter(Boolean).join(', ')}</dd>
            </div>
          )}
        </dl>

        {canCancel ? (
          <CancelBookingForm
            slug={organization.slug}
            token={token}
            windowHours={organization.cancellationWindowHours}
          />
        ) : active ? (
          <p className="mt-8 rounded-[var(--radius-md)] border border-rule bg-surface p-4 text-sm text-ink-2">
            Online cancellation closes {organization.cancellationWindowHours} hours before the appointment.
            {organization.contactEmail
              ? ` Contact ${organization.contactEmail} if your plans change.`
              : ' Contact the business directly if your plans change.'}
          </p>
        ) : booking.status === 'CANCELLED' ? (
          <p
            role="status"
            className="mt-8 rounded-[var(--radius-md)] border border-rule bg-surface p-4 text-sm text-ink-2"
          >
            This booking is cancelled and the time has been released. Want a new time?{' '}
            <Link
              href={`/w/${organization.slug}`}
              className="font-medium text-pine-700 underline underline-offset-2"
            >
              Book again
            </Link>
          </p>
        ) : null}

        <p className="mt-10 text-xs text-ink-3">
          This page is private to you: anyone with the link can see and cancel this booking, so don’t share
          it.
        </p>
      </main>
    </div>
  );
}
