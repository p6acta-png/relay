import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormMessage } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { listServices, listStaff } from '@/modules/catalog/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { requireDashboard } from '@/server/context';
import { ServiceForm } from './service-form';

export const metadata: Metadata = { title: 'Service' };

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { ctx } = await requireDashboard();
  const { services, staff } = await withTenant(ctx.organizationId, async (scope) => ({
    services: await listServices(scope, ctx),
    staff: await listStaff(scope, ctx),
  }));
  const isNew = id === 'new';
  const service = isNew ? null : services.find((s) => s.id === id);
  if (!isNew && !service) notFound();
  const canManage = isAllowed(ctx, 'setup.manage');
  if (isNew && !canManage) notFound();

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/app/setup/services" className="text-sm text-ink-2 hover:text-ink">
        ← Services
      </Link>
      <h2 className="text-xl font-semibold">{service ? service.name : 'New service'}</h2>
      {saved && (
        <FormMessage tone="success">Service created. Customers can now ask for it in the chat.</FormMessage>
      )}
      <ServiceForm
        id={service?.id ?? ''}
        canManage={canManage}
        staff={staff.map((s) => ({ id: s.id, name: s.displayName, active: s.active }))}
        initial={{
          name: service?.name ?? '',
          description: service?.description ?? '',
          kind: service?.kind ?? 'BOOKABLE',
          durationMinutes: service?.durationMinutes ?? 60,
          priceNok: service?.priceMinor == null ? '' : String(service.priceMinor / 100),
          priceIsFrom: service?.priceIsFrom ?? false,
          confirmationMode: service?.confirmationMode ?? 'INSTANT',
          keywords: service?.keywords.join(', ') ?? '',
          active: service?.active ?? true,
          staffIds: service
            ? service.staff.map((s) => s.staffMemberId)
            : staff.filter((s) => s.active).map((s) => s.id),
        }}
      />
    </div>
  );
}
