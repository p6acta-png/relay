import { AccessNotice, PageHeader } from '@/components/ui/misc';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import { SetupNav } from './setup-nav';

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const { dashboard, allowed } = await pageAccess('setup.view');
  if (!allowed) return <AccessNotice what="setup" />;
  const canManage = isAllowed(dashboard.ctx, 'setup.manage');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Setup"
        description={
          canManage
            ? 'Everything Relay knows about your business. The chat, the public page and the booking rules all read from here.'
            : 'You can see how the business is set up. Owners and admins can change it.'
        }
      />
      <SetupNav showOutbox={isAllowed(dashboard.ctx, 'outbox.view')} />
      {children}
    </div>
  );
}
