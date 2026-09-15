'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { zonedTimeToUtc } from '@/lib/time';
import { createTask, setTaskDone } from '@/modules/crm/tasks';
import { field, runAction, type ActionResult } from '@/server/actions';
import { requireMember } from '@/server/context';

export async function toggleTaskAction(form: FormData): Promise<void> {
  const ctx = await requireMember('tasks.update');
  await withTenant(ctx.organizationId, (scope) =>
    setTaskDone(scope, ctx, field(form, 'taskId'), field(form, 'done') === 'true'),
  );
  revalidatePath('/app/tasks');
  revalidatePath('/app', 'layout');
}

export async function createTaskAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'tasks.create',
    async () => {
      const ctx = await requireMember('tasks.create');
      const due = field(form, 'dueDate');
      await withTenant(ctx.organizationId, async (scope) => {
        const { timezone } = await scope.db.organization.findUniqueOrThrow({
          where: { id: scope.organizationId },
          select: { timezone: true },
        });
        // A due date means end of the working day in the business's own time zone.
        const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(due) ? zonedTimeToUtc(due, 16 * 60, timezone) : null;
        return createTask(scope, ctx, {
          title: field(form, 'title'),
          details: field(form, 'details') || undefined,
          assigneeId: field(form, 'assigneeId') || null,
          dueAt,
          kind: 'OTHER',
        });
      });
      revalidatePath('/app/tasks');
      revalidatePath('/app', 'layout');
      return { ok: true, message: 'Task added.' };
    },
    { form },
  );
}
