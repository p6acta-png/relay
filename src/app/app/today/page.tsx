import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/misc';
import { requireDashboard } from '@/server/context';

export const metadata: Metadata = { title: 'Today' };

export default async function TodayPage() {
  const { organization, session } = await requireDashboard();
  return (
    <PageHeader
      eyebrow={organization.name}
      title={`Good to see you, ${session.user.name.split(' ')[0]}`}
      description="Today’s bookings and anything waiting for a person will appear here."
    />
  );
}
