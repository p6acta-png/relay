import type { Metadata } from 'next';
import Link from 'next/link';
import type { ActorType, AuditResult } from '@/generated/prisma/enums';
import { AccessNotice, Badge, EmptyState, PageHeader, type BadgeTone } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { formatInZone } from '@/lib/time';
import { listAuditLog } from '@/modules/audit/audit';
import { pageAccess } from '@/server/context';
import { tableClasses as t } from '../_components/status';

export const metadata: Metadata = { title: 'Audit log' };

const ACTORS: { value: ActorType; label: string; tone: BadgeTone }[] = [
  { value: 'USER', label: 'Team member', tone: 'outline' },
  { value: 'ASSISTANT', label: 'Assistant', tone: 'pine' },
  { value: 'AUTOMATION', label: 'Automation', tone: 'info' },
  { value: 'CUSTOMER', label: 'Customer', tone: 'neutral' },
  { value: 'SYSTEM', label: 'System', tone: 'neutral' },
];
const ENTITIES = [
  'Booking',
  'Conversation',
  'Lead',
  'Task',
  'Automation',
  'Customer',
  'Membership',
  'Invite',
  'Organization',
];
const LINKS: Record<string, (id: string) => string> = {
  Booking: (id) => `/app/bookings/${id}`,
  Conversation: (id) => `/app/inbox/${id}`,
  Automation: (id) => `/app/automations/${id}`,
  Customer: (id) => `/app/customers/${id}`,
  Lead: () => '/app/leads',
  Task: () => '/app/tasks',
};

type Search = { actor?: string; entity?: string; result?: string; before?: string };

async function load(search: Search) {
  const { dashboard, allowed } = await pageAccess('audit.view');
  if (!allowed) return null;
  const actorType = ACTORS.find((a) => a.value === search.actor)?.value;
  const entityType = ENTITIES.includes(search.entity ?? '') ? search.entity : undefined;
  const result = (['SUCCESS', 'FAILURE', 'DENIED'] as AuditResult[]).find((r) => r === search.result);
  const before =
    search.before && !Number.isNaN(Date.parse(search.before)) ? new Date(search.before) : undefined;
  const entries = await withTenant(dashboard.ctx.organizationId, (scope) =>
    listAuditLog(scope, { actorType, entityType, result, before, limit: 60 }),
  );
  return { dashboard, entries, filters: { actorType, entityType, result } };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const data = await load(search);
  if (!data) return <AccessNotice what="the audit log" />;
  const tz = data.dashboard.organization.timezone;
  const query = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      actor: data.filters.actorType,
      entity: data.filters.entityType,
      result: data.filters.result,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/app/audit?${params}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit log"
        title="Audit log"
        description="Significant actions by people, the assistant, automations and customers — written in the same transaction as the change, and never editable by the app."
      />

      <form method="get" action="/app/audit" className="flex flex-wrap items-end gap-3">
        {[
          {
            name: 'actor',
            label: 'Who',
            value: data.filters.actorType,
            options: ACTORS.map((a) => [a.value, a.label]),
          },
          {
            name: 'entity',
            label: 'What',
            value: data.filters.entityType,
            options: ENTITIES.map((e) => [e, e]),
          },
          {
            name: 'result',
            label: 'Result',
            value: data.filters.result,
            options: [
              ['SUCCESS', 'Succeeded'],
              ['FAILURE', 'Failed'],
              ['DENIED', 'Denied'],
            ],
          },
        ].map((filter) => (
          <label key={filter.name} className="text-sm">
            <span className="mb-1 block text-ink-2">{filter.label}</span>
            <select
              name={filter.name}
              defaultValue={filter.value ?? ''}
              className="h-9 rounded-[var(--radius-md)] border border-rule-strong bg-white px-2 text-sm"
            >
              <option value="">Any</option>
              {filter.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button
          type="submit"
          className="h-9 rounded-[var(--radius-md)] bg-ink px-3 text-sm text-white hover:bg-pine-800"
        >
          Filter
        </button>
        {(data.filters.actorType || data.filters.entityType || data.filters.result) && (
          <Link href="/app/audit" className="h-9 px-2 text-sm leading-9 text-ink-2 hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      {data.entries.length === 0 ? (
        <EmptyState title="No entries match">Try removing a filter.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface">
          <table className={t.table}>
            <caption className="sr-only">Audit entries, newest first</caption>
            <thead>
              <tr>
                <th scope="col" className={t.th}>
                  When
                </th>
                <th scope="col" className={t.th}>
                  Who
                </th>
                <th scope="col" className={t.th}>
                  Action
                </th>
                <th scope="col" className={t.th}>
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => {
                const actor = ACTORS.find((a) => a.value === entry.actorType)!;
                const link = entry.entityId ? LINKS[entry.entityType]?.(entry.entityId) : undefined;
                const metadata = Object.entries((entry.metadata ?? {}) as Record<string, unknown>);
                return (
                  <tr key={entry.id} className={cx(t.row, entry.result !== 'SUCCESS' && 'bg-danger-50/40')}>
                    <td className={cx(t.td, 'tabular font-mono text-[0.75rem] whitespace-nowrap text-ink-2')}>
                      {formatInZone(entry.createdAt, tz, 'd MMM HH:mm:ss')}
                    </td>
                    <td className={t.td}>
                      <span className="block">{entry.actorLabel}</span>
                      <Badge tone={actor.tone} className="mt-0.5">
                        {actor.label}
                      </Badge>
                    </td>
                    <td className={t.td}>
                      <span className="font-mono text-[0.8125rem]">{entry.action}</span>
                      {entry.result !== 'SUCCESS' && (
                        <Badge tone="danger" className="ml-2">
                          {entry.result.toLowerCase()}
                        </Badge>
                      )}
                      <span className="block text-xs text-ink-3">
                        {link ? (
                          <Link href={link} className="hover:underline">
                            {entry.entityType}
                          </Link>
                        ) : (
                          entry.entityType
                        )}
                      </span>
                    </td>
                    <td className={cx(t.td, 'font-mono text-[0.6875rem] text-ink-3')}>
                      {metadata.length === 0
                        ? '—'
                        : metadata.map(([k, v]) => (
                            <span key={k} className="mr-3 inline-block">
                              {k}=
                              <span className="text-ink-2">
                                {String(v).length > 40 ? `${String(v).slice(0, 8)}…` : String(v)}
                              </span>
                            </span>
                          ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.entries.length === 60 && (
        <div className="flex justify-center">
          <Link
            href={query({ before: data.entries.at(-1)!.createdAt.toISOString() })}
            className="text-sm text-pine-700 hover:underline"
          >
            Older entries →
          </Link>
        </div>
      )}
    </div>
  );
}
