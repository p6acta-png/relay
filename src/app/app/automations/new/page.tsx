import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessNotice, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { pageAccess } from '@/server/context';
import { AutomationBuilder } from '../_components/automation-builder';
import { loadBuilderOptions } from '../_data';

export const metadata: Metadata = { title: 'New automation' };

async function load() {
  const { dashboard, allowed } = await pageAccess('automations.manage');
  if (!allowed) return null;
  return withTenant(dashboard.ctx.organizationId, (scope) => loadBuilderOptions(scope));
}

export default async function NewAutomationPage() {
  const options = await load();
  if (!options) return <AccessNotice what="editing automations" />;
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/app/automations" className="text-sm text-ink-2 hover:text-ink">
        ← Automations
      </Link>
      <PageHeader eyebrow="Automations" title="New automation" />
      <AutomationBuilder
        options={options}
        initial={{
          name: '',
          description: '',
          trigger: 'CONVERSATION_HANDED_OFF',
          conditions: [],
          actions: [
            {
              type: 'notify_team',
              roles: ['OWNER', 'ADMIN'],
              membershipIds: [],
              message: 'A customer is waiting for a reply',
            },
          ],
          enabled: true,
        }}
      />
    </div>
  );
}
