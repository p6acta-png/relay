import type { Metadata } from 'next';
import { withTenant } from '@/lib/db';
import { getBusinessSettings } from '@/modules/catalog/manage';
import { parseOpeningHours } from '@/modules/catalog/opening-hours';
import { isAllowed } from '@/modules/tenancy/context';
import { requireDashboard } from '@/server/context';
import { BusinessForm } from './business-form';

export const metadata: Metadata = { title: 'Business & rules' };

export default async function BusinessSettingsPage() {
  const { ctx } = await requireDashboard();
  const organization = await withTenant(ctx.organizationId, (scope) => getBusinessSettings(scope, ctx));
  return (
    <BusinessForm
      canManage={isAllowed(ctx, 'setup.manage')}
      initial={{
        name: organization.name,
        tagline: organization.tagline ?? '',
        description: organization.description ?? '',
        contactEmail: organization.contactEmail ?? '',
        contactPhone: organization.contactPhone ?? '',
        addressLine: organization.addressLine ?? '',
        city: organization.city ?? '',
        openingHours: parseOpeningHours(organization.openingHours).map((h) => ({
          weekday: h.weekday,
          startMinute: h.opens,
          endMinute: h.closes,
        })),
        minNoticeMinutes: organization.minNoticeMinutes,
        bookingHorizonDays: organization.bookingHorizonDays,
        cancellationWindowHours: organization.cancellationWindowHours,
        slotIntervalMinutes: organization.slotIntervalMinutes,
        handoffReplyHours: organization.handoffReplyHours,
      }}
      slug={organization.slug}
    />
  );
}
