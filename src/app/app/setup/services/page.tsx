import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { formatDuration } from '@/lib/time';
import { listServices } from '@/modules/catalog/manage';
import { formatPrice } from '@/modules/conversations/flow';
import { isAllowed } from '@/modules/tenancy/context';
import { requireDashboard } from '@/server/context';
import { tableClasses } from '../../_components/status';

export const metadata: Metadata = { title: 'Services' };

export default async function ServicesPage() {
  const { ctx } = await requireDashboard();
  const services = await withTenant(ctx.organizationId, (scope) => listServices(scope, ctx));
  const canManage = isAllowed(ctx, 'setup.manage');

  return (
    <section className="space-y-4" aria-labelledby="services-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="services-heading" className="font-semibold">
            Services
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-3">
            What customers can book or ask a price for. Keywords help Relay recognise a service in a chat
            message — “puncture” for a tube change, for example.
          </p>
        </div>
        {canManage && (
          <ButtonLink href="/app/setup/services/new" size="sm">
            New service
          </ButtonLink>
        )}
      </div>

      {services.length === 0 ? (
        <EmptyState title="No services yet">Add the first thing customers can book.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface">
          <table className={tableClasses.table}>
            <thead>
              <tr>
                <th className={tableClasses.th}>Service</th>
                <th className={tableClasses.th}>Type</th>
                <th className={tableClasses.th}>Duration</th>
                <th className={tableClasses.th}>Price</th>
                <th className={tableClasses.th}>Confirmation</th>
                <th className={tableClasses.th}>Staff</th>
                <th className={tableClasses.th}>Bookings</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className={tableClasses.row}>
                  <td className={tableClasses.td}>
                    <Link href={`/app/setup/services/${service.id}`} className="font-medium hover:underline">
                      {service.name}
                    </Link>
                    {!service.active && (
                      <Badge tone="outline" className="ml-2">
                        Hidden
                      </Badge>
                    )}
                    {service.keywords.length > 0 && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-ink-3">
                        {service.keywords.join(', ')}
                      </p>
                    )}
                  </td>
                  <td className={tableClasses.td}>{service.kind === 'BOOKABLE' ? 'Bookable' : 'Quote'}</td>
                  <td className={`${tableClasses.td} tabular font-mono text-[0.8125rem]`}>
                    {service.durationMinutes ? formatDuration(service.durationMinutes) : '—'}
                  </td>
                  <td className={`${tableClasses.td} tabular whitespace-nowrap`}>
                    {formatPrice(service) ?? 'On request'}
                  </td>
                  <td className={tableClasses.td}>
                    {service.kind === 'QUOTE' ? (
                      <span className="text-ink-3">—</span>
                    ) : service.confirmationMode === 'INSTANT' ? (
                      <Badge tone="pine">Instant</Badge>
                    ) : (
                      <Badge tone="pending">Needs approval</Badge>
                    )}
                  </td>
                  <td className={`${tableClasses.td} tabular`}>
                    {service.kind === 'BOOKABLE' ? service.staff.length : '—'}
                  </td>
                  <td className={`${tableClasses.td} tabular`}>{service._count.bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
