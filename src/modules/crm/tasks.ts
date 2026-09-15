import 'server-only';
import { z } from 'zod';
import type { TaskKind } from '@/generated/prisma/enums';
import type { TenantScope } from '@/lib/db';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { recordAudit } from '@/modules/audit/audit';
import { actorOf, authorizeIn, type ActorContext } from '@/modules/tenancy/context';

export const taskInputSchema = z.object({
  title: z.string().trim().min(2, 'Give the task a title.').max(160),
  details: z.string().trim().max(2000).optional(),
  kind: z.enum(['HANDOFF', 'APPROVAL', 'FOLLOW_UP', 'OTHER']).default('OTHER'),
  assigneeId: z.uuid().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  conversationId: z.uuid().nullable().optional(),
  bookingId: z.uuid().nullable().optional(),
  leadId: z.uuid().nullable().optional(),
});

export async function createTask(
  scope: TenantScope,
  ctx: ActorContext,
  raw: z.input<typeof taskInputSchema>,
) {
  authorizeIn(scope, ctx, 'tasks.create');
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Check the task details.', fieldErrorsFrom(parsed.error.issues));
  }
  const input = parsed.data;
  const { db, organizationId } = scope;
  if (input.assigneeId) {
    const member = await db.membership.findFirst({ where: { id: input.assigneeId, organizationId } });
    if (!member) throw new AppError('NOT_FOUND', 'Team member not found.');
  }
  // Linked rows are protected by composite foreign keys, so a task can only point at this
  // organization's conversation, booking or lead.
  const task = await db.task.create({
    data: {
      organizationId,
      title: input.title,
      details: input.details || null,
      kind: input.kind as TaskKind,
      assigneeId: input.assigneeId ?? null,
      dueAt: input.dueAt ?? null,
      conversationId: input.conversationId ?? null,
      bookingId: input.bookingId ?? null,
      leadId: input.leadId ?? null,
    },
    select: { id: true },
  });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'task.created',
    entityType: 'Task',
    entityId: task.id,
    metadata: { kind: input.kind, assigneeId: input.assigneeId ?? null },
  });
  return task;
}

export async function listTasks(
  scope: TenantScope,
  ctx: ActorContext,
  query: { status?: 'OPEN' | 'DONE'; assigneeId?: string | null } = {},
) {
  authorizeIn(scope, ctx, 'tasks.view');
  return scope.db.task.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeId !== undefined ? { assigneeId: query.assigneeId } : {}),
    },
    orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    include: {
      assignee: { select: { id: true, user: { select: { name: true } } } },
      conversation: { select: { id: true, customer: { select: { name: true } } } },
      booking: { select: { id: true, reference: true, startsAt: true } },
      lead: { select: { id: true, summary: true } },
    },
    take: 300,
  });
}

export async function setTaskDone(scope: TenantScope, ctx: ActorContext, taskId: string, done: boolean) {
  authorizeIn(scope, ctx, 'tasks.update');
  const { count } = await scope.db.task.updateMany({
    where: { id: taskId, organizationId: scope.organizationId },
    data: { status: done ? 'DONE' : 'OPEN', completedAt: done ? new Date() : null },
  });
  if (count === 0) throw new AppError('NOT_FOUND', 'Task not found.');
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: done ? 'task.completed' : 'task.reopened',
    entityType: 'Task',
    entityId: taskId,
  });
}

export async function assignTask(
  scope: TenantScope,
  ctx: ActorContext,
  taskId: string,
  membershipId: string | null,
) {
  authorizeIn(scope, ctx, 'tasks.update');
  if (membershipId) {
    const member = await scope.db.membership.findFirst({
      where: { id: membershipId, organizationId: scope.organizationId },
    });
    if (!member) throw new AppError('NOT_FOUND', 'Team member not found.');
  }
  const { count } = await scope.db.task.updateMany({
    where: { id: taskId, organizationId: scope.organizationId },
    data: { assigneeId: membershipId },
  });
  if (count === 0) throw new AppError('NOT_FOUND', 'Task not found.');
}
