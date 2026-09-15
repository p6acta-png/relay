import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessNotice, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { toLocalDate } from '@/lib/time';
import { formatPrice } from '@/modules/conversations/flow';
import { pageAccess } from '@/server/context';
import { NewBookingForm } from './new-booking-form';

export const metadata: Metadata = { title: 'New booking' };

async function load() {
  const { dashboard, allowed } = await pageAccess('bookings.create');
  if (!allowed) return null;
  const services = await withTenant(dashboard.ctx.organizationId, ({ db, organizationId }) =>
    db.service.findMany({
      where: { organizationId, active: true, kind: 'BOOKABLE' },
      orderBy: { sortOrder: 'asc' },
    }),
  );
  return { services, today: toLocalDate(new Date(), dashboard.organization.timezone) };
}

export default async function NewBookingPage() {
  const data = await load();
  if (!data) return <AccessNotice what="creating bookings" />;
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/app/bookings" className="text-sm text-ink-2 hover:text-ink">
        ← Bookings
      </Link>
      <PageHeader
        eyebrow="Bookings"
        title="New booking"
        description="For bookings made by phone or at the counter. The same rules apply as in the chat, and the customer gets the same confirmation email."
      />
      <NewBookingForm
        today={data.today}
        services={data.services.map((s) => ({
          id: s.id,
          label: `${s.name} · ${s.durationMinutes} min${formatPrice(s) ? ` · ${formatPrice(s)}` : ''}${s.confirmationMode === 'APPROVAL' ? ' · needs approval' : ''}`,
        }))}
      />
    </div>
  );
}
