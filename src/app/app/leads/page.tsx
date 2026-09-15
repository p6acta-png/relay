import type { Metadata } from 'next';
import Link from 'next/link';
import type { LeadStatus } from '@/generated/prisma/enums';
import { AccessNotice, EmptyState, PageHeader } from '@/components/ui/misc';
import { prisma, withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { formatRelative } from '@/lib/time';
import { listLeads } from '@/modules/crm/leads';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import { LEAD_STATUS_LABELS } from '../_components/status';
import { updateLeadAction } from './actions';

export const metadata: Metadata = { title: 'Leads' };

const COLUMNS: { status: LeadStatus; hint: string }[] = [
  { status: 'NEW', hint: 'Not contacted yet' },
  { status: 'CONTACTED', hint: 'Waiting on the customer' },
  { status: 'WON', hint: 'Turned into work' },
  { status: 'LOST', hint: 'Didn’t go ahead' },
];

async function load() {
  const { dashboard, allowed } = await pageAccess('leads.view');
  if (!allowed) return null;
  const leads = await withTenant(dashboard.ctx.organizationId, (scope) => listLeads(scope, dashboard.ctx));
  const team = await prisma.membership.findMany({
    where: { organizationId: dashboard.ctx.organizationId },
    select: { id: true, user: { select: { name: true } } },
  });
  return { dashboard, leads, team, now: new Date() };
}

export default async function LeadsPage() {
  const data = await load();
  if (!data) return <AccessNotice what="leads" />;
  const tz = data.dashboard.organization.timezone;
  const canUpdate = isAllowed(data.dashboard.ctx, 'leads.update');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Leads"
        description="Requests that need a person to price or plan — usually quotes Relay collected in the chat."
      />
      {data.leads.length === 0 ? (
        <EmptyState title="No leads yet">
          When a customer asks for a quote, Relay collects their details and the request lands here.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const leads = data.leads.filter((l) => l.status === column.status);
            return (
              <section key={column.status} aria-labelledby={`col-${column.status}`} className="min-w-0">
                <header className="mb-2 flex items-baseline justify-between border-b-2 border-ink pb-1.5">
                  <h2 id={`col-${column.status}`} className="text-sm font-semibold">
                    {LEAD_STATUS_LABELS[column.status]}{' '}
                    <span className="font-mono text-xs font-normal text-ink-3">{leads.length}</span>
                  </h2>
                  <span className="text-xs text-ink-3">{column.hint}</span>
                </header>
                <ul className="space-y-2">
                  {leads.map((lead) => (
                    <li
                      key={lead.id}
                      className={cx(
                        'rounded-[var(--radius-lg)] border bg-surface p-3',
                        lead.status === 'NEW' ? 'border-signal-500/30' : 'border-rule',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{lead.customer.name ?? 'Anonymised'}</p>
                        <span className="shrink-0 font-mono text-[0.625rem] text-ink-3">
                          {formatRelative(lead.createdAt, data.now, tz)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-3">{lead.service?.name ?? 'General request'}</p>
                      <p className="mt-2 line-clamp-3 text-sm text-ink-2">{lead.summary}</p>
                      {lead.customer.email && (
                        <p className="mt-2 truncate text-xs text-ink-2">{lead.customer.email}</p>
                      )}
                      {canUpdate ? (
                        <form
                          action={updateLeadAction}
                          className="mt-3 grid grid-cols-2 gap-1.5 border-t border-rule pt-2.5"
                        >
                          <input type="hidden" name="leadId" value={lead.id} />
                          <label className="sr-only" htmlFor={`status-${lead.id}`}>
                            Status
                          </label>
                          <select
                            id={`status-${lead.id}`}
                            name="status"
                            defaultValue={lead.status}
                            className="h-8 rounded-[var(--radius-md)] border border-rule-strong bg-white px-1.5 text-xs"
                          >
                            {COLUMNS.map((c) => (
                              <option key={c.status} value={c.status}>
                                {LEAD_STATUS_LABELS[c.status]}
                              </option>
                            ))}
                          </select>
                          <label className="sr-only" htmlFor={`assignee-${lead.id}`}>
                            Assigned to
                          </label>
                          <select
                            id={`assignee-${lead.id}`}
                            name="assigneeId"
                            defaultValue={lead.assigneeId ?? ''}
                            className="h-8 rounded-[var(--radius-md)] border border-rule-strong bg-white px-1.5 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {data.team.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.user.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="col-span-2 h-7 rounded-[var(--radius-md)] text-xs font-medium text-pine-700 hover:bg-pine-50"
                          >
                            Update
                          </button>
                        </form>
                      ) : (
                        lead.assignee && (
                          <p className="mt-2 text-xs text-ink-3">Assigned to {lead.assignee.user.name}</p>
                        )
                      )}
                      {lead.conversationId && (
                        <Link
                          href={`/app/inbox/${lead.conversationId}`}
                          className="mt-1 inline-block text-xs text-pine-700 hover:underline"
                        >
                          Conversation →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
