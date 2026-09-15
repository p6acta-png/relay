import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessNotice, Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { prisma, withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { formatInZone } from '@/lib/time';
import { listTasks } from '@/modules/crm/tasks';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import { FilterTabs } from '../_components/status';
import { toggleTaskAction } from './actions';
import { NewTaskForm } from './new-task-form';

export const metadata: Metadata = { title: 'Tasks' };

type View = 'mine' | 'open' | 'done';
const KIND_LABEL = {
  HANDOFF: 'Hand-off',
  APPROVAL: 'Approval',
  FOLLOW_UP: 'Follow-up',
  OTHER: 'Task',
} as const;

async function load(view: View) {
  const { dashboard, allowed } = await pageAccess('tasks.view');
  if (!allowed) return null;
  const { ctx } = dashboard;
  const tasks = await withTenant(ctx.organizationId, async (scope) => {
    const all = await listTasks(scope, ctx, { status: view === 'done' ? 'DONE' : 'OPEN' });
    return view === 'mine'
      ? all.filter((t) => t.assigneeId === ctx.membershipId || t.assigneeId === null)
      : all;
  });
  const team = await prisma.membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, user: { select: { name: true } } },
  });
  return { dashboard, tasks, team, now: new Date() };
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requested = (await searchParams).view;
  const view: View = requested === 'open' || requested === 'done' ? requested : 'mine';
  const data = await load(view);
  if (!data) return <AccessNotice what="tasks" />;
  const tz = data.dashboard.organization.timezone;
  const canUpdate = isAllowed(data.dashboard.ctx, 'tasks.update');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tasks"
        title="Tasks"
        description="Follow-ups created by automations and by the team."
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <FilterTabs
            label="Task views"
            tabs={[
              { href: '/app/tasks', label: 'Mine & unassigned', active: view === 'mine' },
              { href: '/app/tasks?view=open', label: 'All open', active: view === 'open' },
              { href: '/app/tasks?view=done', label: 'Done', active: view === 'done' },
            ]}
          />
          {data.tasks.length === 0 ? (
            <EmptyState title={view === 'done' ? 'Nothing completed yet' : 'All clear'}>
              {view === 'done' ? 'Completed tasks show up here.' : 'No open tasks right now.'}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-rule rounded-[var(--radius-lg)] border border-rule bg-surface">
              {data.tasks.map((task) => {
                const overdue = task.status === 'OPEN' && task.dueAt && task.dueAt < data.now;
                const link = task.conversation
                  ? {
                      href: `/app/inbox/${task.conversation.id}`,
                      label: `Conversation${task.conversation.customer?.name ? ` with ${task.conversation.customer.name}` : ''}`,
                    }
                  : task.booking
                    ? { href: `/app/bookings/${task.booking.id}`, label: `Booking ${task.booking.reference}` }
                    : task.lead
                      ? { href: '/app/leads', label: 'Lead' }
                      : null;
                return (
                  <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                    {canUpdate ? (
                      <form action={toggleTaskAction} className="pt-0.5">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="done" value={String(task.status === 'OPEN')} />
                        <button
                          type="submit"
                          role="checkbox"
                          aria-checked={task.status === 'DONE'}
                          aria-label={
                            task.status === 'DONE' ? `Reopen “${task.title}”` : `Mark “${task.title}” as done`
                          }
                          className={cx(
                            'flex size-5 items-center justify-center rounded-[var(--radius-sm)] border text-[0.6875rem]',
                            task.status === 'DONE'
                              ? 'border-pine-700 bg-pine-700 text-white'
                              : 'border-rule-strong bg-white hover:border-pine-600',
                          )}
                        >
                          {task.status === 'DONE' ? '✓' : ''}
                        </button>
                      </form>
                    ) : (
                      <span className="size-5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cx(
                          'text-sm',
                          task.status === 'DONE' ? 'text-ink-3 line-through' : 'font-medium',
                        )}
                      >
                        {task.title}
                      </p>
                      {task.details && <p className="mt-0.5 text-sm text-ink-2">{task.details}</p>}
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                        <Badge
                          tone={
                            task.kind === 'HANDOFF'
                              ? 'signal'
                              : task.kind === 'APPROVAL'
                                ? 'pending'
                                : 'neutral'
                          }
                        >
                          {KIND_LABEL[task.kind]}
                        </Badge>
                        <span>{task.assignee ? task.assignee.user.name : 'Unassigned'}</span>
                        {link && (
                          <Link href={link.href} className="text-pine-700 hover:underline">
                            {link.label}
                          </Link>
                        )}
                      </p>
                    </div>
                    {task.dueAt && (
                      <span
                        className={cx(
                          'shrink-0 font-mono text-[0.6875rem]',
                          overdue ? 'text-danger-700' : 'text-ink-3',
                        )}
                      >
                        {overdue ? 'overdue · ' : 'due '}
                        {formatInZone(task.dueAt, tz, 'd MMM HH:mm')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {isAllowed(data.dashboard.ctx, 'tasks.create') && (
          <aside>
            <NewTaskForm team={data.team.map((m) => ({ id: m.id, name: m.user.name }))} />
          </aside>
        )}
      </div>
    </div>
  );
}
