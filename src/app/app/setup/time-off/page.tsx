import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { formatInZone, toLocalDate } from '@/lib/time';
import { listStaff, listTimeOff } from '@/modules/catalog/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { requireDashboard } from '@/server/context';
import { tableClasses } from '../../_components/status';
import { removeTimeOffAction } from '../actions';
import { TimeOffForm } from './time-off-form';

export const metadata: Metadata = { title: 'Time off' };

async function load() {
  const { ctx, organization } = await requireDashboard();
  const now = new Date();
  const data = await withTenant(ctx.organizationId, async (scope) => ({
    entries: await listTimeOff(scope, ctx, now),
    staff: await listStaff(scope, ctx),
  }));
  return { ctx, tz: organization.timezone, today: toLocalDate(now, organization.timezone), ...data };
}

export default async function TimeOffPage() {
  const { ctx, tz, today, entries, staff } = await load();
  const canManage = isAllowed(ctx, 'setup.manage');
  const format = (start: Date, end: Date) => {
    const sameDay = toLocalDate(start, tz) === toLocalDate(new Date(end.getTime() - 1), tz);
    const wholeDays =
      formatInZone(start, tz, 'HH:mm') === '00:00' && formatInZone(end, tz, 'HH:mm') === '00:00';
    if (wholeDays) {
      const last = new Date(end.getTime() - 1);
      return sameDay
        ? formatInZone(start, tz, 'EEE d MMM')
        : `${formatInZone(start, tz, 'EEE d MMM')} – ${formatInZone(last, tz, 'EEE d MMM')}`;
    }
    return sameDay
      ? `${formatInZone(start, tz, 'EEE d MMM, HH:mm')}–${formatInZone(end, tz, 'HH:mm')}`
      : `${formatInZone(start, tz, 'EEE d MMM, HH:mm')} – ${formatInZone(end, tz, 'EEE d MMM, HH:mm')}`;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="time-off-heading" className="space-y-4">
        <div>
          <h2 id="time-off-heading" className="font-semibold">
            Upcoming time off
          </h2>
          <p className="mt-0.5 text-sm text-ink-3">
            Holidays, courses and closed days. Relay won’t offer these times. Existing bookings are not
            cancelled automatically — you decide what to do with them.
          </p>
        </div>
        {entries.length === 0 ? (
          <EmptyState title="Nothing planned">Everyone works their normal hours.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface">
            <table className={tableClasses.table}>
              <thead>
                <tr>
                  <th className={tableClasses.th}>When</th>
                  <th className={tableClasses.th}>Who</th>
                  <th className={tableClasses.th}>Reason</th>
                  {canManage && (
                    <th className={tableClasses.th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className={tableClasses.row}>
                    <td className={`${tableClasses.td} tabular whitespace-nowrap`}>
                      {format(entry.startsAt, entry.endsAt)}
                    </td>
                    <td className={tableClasses.td}>
                      {entry.staffMember?.displayName ?? <span className="font-medium">Whole business</span>}
                    </td>
                    <td className={`${tableClasses.td} text-ink-2`}>{entry.reason ?? '—'}</td>
                    {canManage && (
                      <td className={`${tableClasses.td} text-right`}>
                        <form action={removeTimeOffAction}>
                          <input type="hidden" name="id" value={entry.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove time off ${format(entry.startsAt, entry.endsAt)}`}
                          >
                            Remove
                          </Button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <aside
          aria-labelledby="add-time-off"
          className="h-fit rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
        >
          <h2 id="add-time-off" className="mb-3 font-semibold">
            Add time off
          </h2>
          <TimeOffForm
            today={today}
            staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.displayName }))}
          />
        </aside>
      )}
    </div>
  );
}
