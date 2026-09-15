import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { minutesToTime, WEEKDAY_SHORT } from '@/lib/time';
import { listStaff } from '@/modules/catalog/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { ROLE_LABELS } from '@/modules/tenancy/permissions';
import { requireDashboard } from '@/server/context';
import { Initials } from '../../_components/status';

export const metadata: Metadata = { title: 'Staff & hours' };

export default async function StaffPage() {
  const { ctx } = await requireDashboard();
  const staff = await withTenant(ctx.organizationId, (scope) => listStaff(scope, ctx));
  const canManage = isAllowed(ctx, 'setup.manage');

  return (
    <section className="space-y-4" aria-labelledby="staff-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="staff-heading" className="font-semibold">
            Staff & working hours
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-3">
            Bookable times are built from each person’s hours, minus their bookings and time off. When a
            customer doesn’t mind who, Relay picks someone who is free.
          </p>
        </div>
        {canManage && (
          <ButtonLink href="/app/setup/staff/new" size="sm">
            Add staff member
          </ButtonLink>
        )}
      </div>

      {staff.length === 0 ? (
        <EmptyState title="No staff yet">Add the people who do the work.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {staff.map((person) => (
            <li key={person.id} className="rounded-[var(--radius-lg)] border border-rule bg-surface p-4">
              <div className="flex items-start gap-3">
                <Initials name={person.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/setup/staff/${person.id}`} className="font-medium hover:underline">
                      {person.displayName}
                    </Link>
                    {!person.active && <Badge tone="outline">Inactive</Badge>}
                    {person.membership && (
                      <Badge tone="info">Login · {ROLE_LABELS[person.membership.role]}</Badge>
                    )}
                  </p>
                  {person.title && <p className="text-sm text-ink-3">{person.title}</p>}
                </div>
              </div>
              <dl
                className="mt-3 grid grid-cols-7 gap-1 text-center"
                aria-label={`${person.displayName}’s weekly hours`}
              >
                {WEEKDAY_SHORT.map((day, index) => {
                  const ranges = person.workingHours.filter((h) => h.weekday === index + 1);
                  return (
                    <div
                      key={day}
                      className={
                        ranges.length
                          ? 'rounded-[var(--radius-sm)] bg-pine-50 py-1.5'
                          : 'rounded-[var(--radius-sm)] bg-sunken/60 py-1.5'
                      }
                    >
                      <dt className="text-[0.6875rem] font-medium text-ink-2">{day}</dt>
                      <dd className="tabular font-mono text-[0.625rem] leading-tight text-ink-3">
                        {ranges.length
                          ? ranges.map((r) => (
                              <span key={r.id} className="block">
                                {minutesToTime(r.startMinute)}
                                <br />
                                {minutesToTime(r.endMinute)}
                              </span>
                            ))
                          : 'off'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-3 text-xs text-ink-3">
                {person.services.length
                  ? `Does: ${person.services.map((s) => s.service.name).join(', ')}`
                  : 'Not linked to any bookable service yet.'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
