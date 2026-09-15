import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormMessage } from '@/components/ui/misc';
import { prisma, withTenant } from '@/lib/db';
import { listStaff } from '@/modules/catalog/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { ROLE_LABELS } from '@/modules/tenancy/permissions';
import { requireDashboard } from '@/server/context';
import { StaffForm } from './staff-form';

export const metadata: Metadata = { title: 'Staff member' };

export default async function StaffMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { ctx } = await requireDashboard();
  const staff = await withTenant(ctx.organizationId, (scope) => listStaff(scope, ctx));
  const isNew = id === 'new';
  const person = isNew ? null : staff.find((s) => s.id === id);
  const canManage = isAllowed(ctx, 'setup.manage');
  if ((!isNew && !person) || (isNew && !canManage)) notFound();

  // Logins that can be linked: members not already linked to someone else.
  const members = await prisma.membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, role: true, user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const linked = new Map(
    staff.filter((s) => s.membership && s.id !== person?.id).map((s) => [s.membership!.id, s.displayName]),
  );

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/app/setup/staff" className="text-sm text-ink-2 hover:text-ink">
        ← Staff & hours
      </Link>
      <h2 className="text-xl font-semibold">{person ? person.displayName : 'New staff member'}</h2>
      {saved && (
        <FormMessage tone="success">
          Staff member added. Link them to services so customers can book them.
        </FormMessage>
      )}
      <StaffForm
        id={person?.id ?? ''}
        canManage={canManage}
        members={members.map((m) => ({
          id: m.id,
          label: `${m.user.name} (${ROLE_LABELS[m.role]})`,
          linkedTo: linked.get(m.id) ?? null,
        }))}
        initial={{
          displayName: person?.displayName ?? '',
          title: person?.title ?? '',
          active: person?.active ?? true,
          membershipId: person?.membership?.id ?? '',
          hours: person
            ? person.workingHours.map((h) => ({
                weekday: h.weekday,
                startMinute: h.startMinute,
                endMinute: h.endMinute,
              }))
            : [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })),
        }}
      />
    </div>
  );
}
