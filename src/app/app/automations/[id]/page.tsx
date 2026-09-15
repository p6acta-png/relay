import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AccessNotice, Badge, FormMessage, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { cx } from '@/lib/cx';
import { formatInZone } from '@/lib/time';
import { ACTION_LABELS, TRIGGERS, type Action } from '@/modules/automations/definitions';
import { describeAutomation } from '@/modules/automations/describe';
import { getAutomation, listRuns } from '@/modules/automations/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import { deleteAutomationAction } from '../actions';
import { AutomationBuilder } from '../_components/automation-builder';
import { loadBuilderOptions } from '../_data';

export const metadata: Metadata = { title: 'Automation' };

async function load(id: string) {
  const { dashboard, allowed } = await pageAccess('automations.view');
  if (!allowed) return { denied: true as const };
  try {
    return await withTenant(dashboard.ctx.organizationId, async (scope) => ({
      dashboard,
      ...(await getAutomation(scope, dashboard.ctx, id)),
      runs: await listRuns(scope, dashboard.ctx, id, 30),
      options: await loadBuilderOptions(scope),
    }));
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

export default async function AutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const data = await load(id);
  if (data === null) notFound();
  if ('denied' in data) return <AccessNotice what="automations" />;
  const { automation, definition, runs, options, dashboard } = data;
  const tz = dashboard.organization.timezone;
  const canManage = isAllowed(dashboard.ctx, 'automations.manage');

  return (
    <div className="max-w-4xl space-y-8">
      <Link href="/app/automations" className="text-sm text-ink-2 hover:text-ink">
        ← Automations
      </Link>
      {saved && <FormMessage tone="success">Automation created.</FormMessage>}
      <PageHeader
        eyebrow={`Automation · ${TRIGGERS[automation.trigger].label}`}
        title={automation.name}
        description={automation.description ?? undefined}
        actions={
          canManage && (
            <form action={deleteAutomationAction}>
              <input type="hidden" name="id" value={automation.id} />
              <Button type="submit" variant="danger" size="sm">
                Delete
              </Button>
            </form>
          )
        }
      />

      {canManage ? (
        definition ? (
          <AutomationBuilder id={automation.id} initial={definition} options={options} />
        ) : (
          <FormMessage tone="error">
            The saved settings of this automation are no longer valid (for example, a service was removed).
            Delete it and create it again.
          </FormMessage>
        )
      ) : (
        definition && <p className="font-serif text-lg">{describeAutomation(definition, options.names)}</p>
      )}

      <section aria-labelledby="runs-title" className="space-y-3">
        <h2 id="runs-title" className="text-[0.9375rem] font-semibold">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-3">This automation hasn’t run yet.</p>
        ) : (
          <ol className="divide-y divide-rule rounded-[var(--radius-lg)] border border-rule bg-surface">
            {runs.map((run) => (
              <li key={run.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Badge
                      tone={run.status === 'SUCCEEDED' ? 'pine' : run.status === 'FAILED' ? 'danger' : 'info'}
                      dot
                    >
                      {run.status.toLowerCase()}
                    </Badge>
                    <span className="font-mono text-[0.75rem] text-ink-2">
                      {formatInZone(run.startedAt, tz, 'd MMM yyyy, HH:mm:ss')}
                    </span>
                  </span>
                  <span className="flex gap-3 text-xs">
                    {run.conversationId && (
                      <Link
                        href={`/app/inbox/${run.conversationId}`}
                        className="text-pine-700 hover:underline"
                      >
                        Conversation
                      </Link>
                    )}
                    {run.bookingId && (
                      <Link href={`/app/bookings/${run.bookingId}`} className="text-pine-700 hover:underline">
                        Booking
                      </Link>
                    )}
                    {run.leadId && (
                      <Link href="/app/leads" className="text-pine-700 hover:underline">
                        Lead
                      </Link>
                    )}
                  </span>
                </div>
                <ol className="mt-2 space-y-0.5 text-[0.8125rem]">
                  {run.steps.map((step, i) => (
                    <li
                      key={i}
                      className={cx(
                        'flex gap-2',
                        step.status === 'failed'
                          ? 'text-danger-700'
                          : step.status === 'skipped'
                            ? 'text-ink-3'
                            : 'text-ink-2',
                      )}
                    >
                      <span className="w-14 shrink-0 font-mono text-[0.6875rem] uppercase">
                        {step.status}
                      </span>
                      <span>
                        {ACTION_LABELS[step.action as Action['type']] ?? step.action} — {step.detail}
                      </span>
                    </li>
                  ))}
                  {run.error && run.steps.length === 0 && <li className="text-danger-700">{run.error}</li>}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
