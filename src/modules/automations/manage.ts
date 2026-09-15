import 'server-only';
import type { TenantScope } from '@/lib/db';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { recordAudit } from '@/modules/audit/audit';
import { actorOf, authorizeIn, type ActorContext } from '@/modules/tenancy/context';
import { automationDefinitionSchema, type AutomationDefinition } from './definitions';
import { runStepSchema } from './engine';

export async function listAutomations(scope: TenantScope, ctx: ActorContext) {
  authorizeIn(scope, ctx, 'automations.view');
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const automations = await scope.db.automation.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: { createdAt: 'asc' },
    include: { runs: { orderBy: { startedAt: 'desc' }, take: 1, select: { status: true, startedAt: true } } },
  });
  const counts = await scope.db.automationRun.groupBy({
    by: ['automationId', 'status'],
    where: { organizationId: scope.organizationId, startedAt: { gte: since } },
    _count: { _all: true },
  });
  return automations.map((automation) => {
    const mine = counts.filter((c) => c.automationId === automation.id);
    const parsed = automationDefinitionSchema.safeParse({
      ...automation,
      description: automation.description ?? '',
    });
    return {
      ...automation,
      valid: parsed.success,
      definition: parsed.success ? parsed.data : null,
      lastRun: automation.runs[0] ?? null,
      runs30d: {
        succeeded: mine.find((c) => c.status === 'SUCCEEDED')?._count._all ?? 0,
        failed: mine.find((c) => c.status === 'FAILED')?._count._all ?? 0,
      },
    };
  });
}

export async function getAutomation(scope: TenantScope, ctx: ActorContext, id: string) {
  authorizeIn(scope, ctx, 'automations.view');
  const automation = await scope.db.automation.findFirst({
    where: { id, organizationId: scope.organizationId },
  });
  if (!automation) throw new AppError('NOT_FOUND', 'Automation not found.');
  const parsed = automationDefinitionSchema.safeParse({
    ...automation,
    description: automation.description ?? '',
  });
  return { automation, definition: parsed.success ? parsed.data : null };
}

export async function listRuns(scope: TenantScope, ctx: ActorContext, automationId?: string, take = 50) {
  authorizeIn(scope, ctx, 'automations.view');
  const runs = await scope.db.automationRun.findMany({
    where: { organizationId: scope.organizationId, ...(automationId ? { automationId } : {}) },
    orderBy: { startedAt: 'desc' },
    take,
    include: { automation: { select: { name: true } } },
  });
  return runs.map((run) => ({ ...run, steps: runStepSchema.array().safeParse(run.steps).data ?? [] }));
}

// #region learn:save-automation
export async function saveAutomation(
  scope: TenantScope,
  ctx: ActorContext,
  params: { id?: string; definition: unknown },
) {
  authorizeIn(scope, ctx, 'automations.manage');
  const parsed = automationDefinitionSchema.safeParse(params.definition);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION',
      'Some parts of this automation need fixing.',
      fieldErrorsFrom(parsed.error.issues),
    );
  }
  const definition = parsed.data;
  await assertReferencesBelongToOrganization(scope, definition);

  const data = {
    name: definition.name,
    description: definition.description || null,
    trigger: definition.trigger,
    conditions: definition.conditions,
    actions: definition.actions,
    enabled: definition.enabled,
  };

  let id = params.id;
  if (id) {
    const { count } = await scope.db.automation.updateMany({
      where: { id, organizationId: scope.organizationId },
      data,
    });
    if (count === 0) throw new AppError('NOT_FOUND', 'Automation not found.');
  } else {
    const created = await scope.db.automation.create({
      data: {
        ...data,
        organizationId: scope.organizationId,
        createdByMembershipId: ctx.kind === 'member' ? ctx.membershipId : null,
      },
      select: { id: true },
    });
    id = created.id;
  }
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: params.id ? 'automation.updated' : 'automation.created',
    entityType: 'Automation',
    entityId: id,
    metadata: {
      trigger: definition.trigger,
      conditions: definition.conditions.length,
      actions: definition.actions.length,
    },
  });
  return { id };
}
// #endregion learn:save-automation

/** IDs inside the JSON configuration are not covered by foreign keys, so they are checked here. */
async function assertReferencesBelongToOrganization(scope: TenantScope, definition: AutomationDefinition) {
  const serviceIds = definition.conditions.flatMap((c) => (c.type === 'service_is' ? c.serviceIds : []));
  const membershipIds = definition.actions.flatMap((a) =>
    a.type === 'notify_team'
      ? a.membershipIds
      : a.type === 'assign_to'
        ? [a.membershipId]
        : a.type === 'create_task' && a.assigneeId
          ? [a.assigneeId]
          : [],
  );
  if (serviceIds.length) {
    const found = await scope.db.service.count({
      where: { organizationId: scope.organizationId, id: { in: serviceIds } },
    });
    if (found !== new Set(serviceIds).size)
      throw new AppError('VALIDATION', 'One of the chosen services no longer exists.');
  }
  if (membershipIds.length) {
    const found = await scope.db.membership.count({
      where: { organizationId: scope.organizationId, id: { in: membershipIds } },
    });
    if (found !== new Set(membershipIds).size)
      throw new AppError('VALIDATION', 'One of the chosen team members is no longer on the team.');
  }
}

export async function setAutomationEnabled(
  scope: TenantScope,
  ctx: ActorContext,
  id: string,
  enabled: boolean,
) {
  authorizeIn(scope, ctx, 'automations.manage');
  const { count } = await scope.db.automation.updateMany({
    where: { id, organizationId: scope.organizationId },
    data: { enabled },
  });
  if (count === 0) throw new AppError('NOT_FOUND', 'Automation not found.');
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: enabled ? 'automation.enabled' : 'automation.disabled',
    entityType: 'Automation',
    entityId: id,
  });
}

export async function deleteAutomation(scope: TenantScope, ctx: ActorContext, id: string) {
  authorizeIn(scope, ctx, 'automations.manage');
  const automation = await scope.db.automation.findFirst({
    where: { id, organizationId: scope.organizationId },
  });
  if (!automation) throw new AppError('NOT_FOUND', 'Automation not found.');
  await scope.db.automation.delete({ where: { id: automation.id } });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'automation.deleted',
    entityType: 'Automation',
    entityId: id,
    metadata: { trigger: automation.trigger },
  });
}
