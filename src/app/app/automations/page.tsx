import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { IconBolt } from '@/components/ui/icons';
import { AccessNotice, Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { formatRelative } from '@/lib/time';
import { TRIGGERS } from '@/modules/automations/definitions';
import { describeAutomation } from '@/modules/automations/describe';
import { listAutomations } from '@/modules/automations/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import { toggleAutomationAction } from './actions';
import { loadBuilderOptions } from './_data';

export const metadata: Metadata = { title: 'Automations' };

async function load() {
  const { dashboard, allowed } = await pageAccess('automations.view');
  if (!allowed) return null;
  const data = await withTenant(dashboard.ctx.organizationId, async (scope) => ({
    automations: await listAutomations(scope, dashboard.ctx),
    options: await loadBuilderOptions(scope),
  }));
  return { ...data, dashboard, now: new Date() };
}

export default async function AutomationsPage() {
  const data = await load();
  if (!data) return <AccessNotice what="automations" />;
  const canManage = isAllowed(data.dashboard.ctx, 'automations.manage');
  const tz = data.dashboard.organization.timezone;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automations"
        title="Automations"
        description="Small rules that run after something happens: a hand-off, a booking, a new lead. Every run is recorded, step by step."
        actions={
          canManage && (
            <ButtonLink href="/app/automations/new" size="sm">
              New automation
            </ButtonLink>
          )
        }
      />

      <section className="grid gap-3 rounded-[var(--radius-lg)] border border-rule bg-surface p-4 text-sm text-ink-2 md:grid-cols-3">
        <p>
          <span className="eyebrow block">When</span>
          One of six things happens — a conversation starts, a booking is requested, confirmed or cancelled, a
          lead comes in, or Relay hands over.
        </p>
        <p>
          <span className="eyebrow block">If</span>
          Optional conditions: which service, open or closed, new or returning customer, chat or email.
        </p>
        <p>
          <span className="eyebrow block">Then</span>
          Reply, email the customer, notify the team, create a task, assign or hand over. Automations never
          create or cancel bookings.
        </p>
      </section>

      {data.automations.length === 0 ? (
        <EmptyState
          title="No automations yet"
          action={canManage && <ButtonLink href="/app/automations/new">Create one</ButtonLink>}
        >
          Start with “tell the team when Relay hands over”, so nothing waits unnoticed.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.automations.map((automation) => (
            <li
              key={automation.id}
              className={cx(
                'rounded-[var(--radius-lg)] border bg-surface p-4',
                automation.enabled ? 'border-rule' : 'border-dashed border-rule-strong bg-transparent',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <IconBolt className={cx('size-4', automation.enabled ? 'text-pine-700' : 'text-ink-3')} />
                    <Link href={`/app/automations/${automation.id}`} className="font-medium hover:underline">
                      {automation.name}
                    </Link>
                    {!automation.enabled && <Badge tone="neutral">Off</Badge>}
                    {!automation.valid && <Badge tone="danger">Needs fixing</Badge>}
                  </div>
                  <p className="mt-1.5 max-w-3xl text-sm text-ink-2">
                    {automation.definition
                      ? describeAutomation(automation.definition, data.options.names)
                      : `When ${TRIGGERS[automation.trigger].label.toLowerCase()} — the saved settings are no longer valid.`}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.6875rem] text-ink-3">
                    <span>
                      Last run:{' '}
                      {automation.lastRun ? (
                        <span className={automation.lastRun.status === 'FAILED' ? 'text-danger-700' : ''}>
                          {automation.lastRun.status.toLowerCase()}{' '}
                          {formatRelative(automation.lastRun.startedAt, data.now, tz)}
                        </span>
                      ) : (
                        'never'
                      )}
                    </span>
                    <span>
                      30 days: {automation.runs30d.succeeded} succeeded
                      {automation.runs30d.failed > 0 && (
                        <span className="text-danger-700"> · {automation.runs30d.failed} failed</span>
                      )}
                    </span>
                  </p>
                </div>
                {canManage && (
                  <form action={toggleAutomationAction}>
                    <input type="hidden" name="id" value={automation.id} />
                    <input type="hidden" name="enabled" value={String(!automation.enabled)} />
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={automation.enabled}
                      aria-label={`${automation.enabled ? 'Turn off' : 'Turn on'} “${automation.name}”`}
                      className={cx(
                        'relative h-6 w-11 rounded-full transition-colors',
                        automation.enabled ? 'bg-pine-700' : 'bg-rule-strong',
                      )}
                    >
                      <span
                        className={cx(
                          'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]',
                          automation.enabled ? 'left-[22px]' : 'left-0.5',
                        )}
                      />
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
