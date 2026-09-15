import 'server-only';
import { z } from 'zod';
import type { LeadStatus, Origin } from '@/generated/prisma/enums';
import type { TenantScope } from '@/lib/db';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { recordAudit } from '@/modules/audit/audit';
import { upsertCustomer } from '@/modules/customers/customers';
import { customerDetailsSchema } from '@/modules/customers/schemas';
import { domainEvent, type WithEvents } from '@/modules/events';
import { actorOf, authorizeIn, type ActorContext } from '@/modules/tenancy/context';

/** A lead is a potential piece of work that needs a person: a quote, a special request. */
export const leadInputSchema = z.object({
  customer: customerDetailsSchema,
  serviceId: z.uuid().nullable().optional(),
  summary: z.string().trim().min(3, 'Describe what the customer needs.').max(1000),
  origin: z.enum(['CHAT', 'EMAIL', 'DASHBOARD']),
  conversationId: z.uuid().nullable().optional(),
});

export async function createLead(
  scope: TenantScope,
  ctx: ActorContext,
  raw: z.input<typeof leadInputSchema>,
): Promise<WithEvents<{ id: string }>> {
  authorizeIn(scope, ctx, 'leads.create');
  const parsed = leadInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Check the lead details.', fieldErrorsFrom(parsed.error.issues));
  }
  const input = parsed.data;
  const { db, organizationId } = scope;

  if (input.serviceId) {
    const service = await db.service.findFirst({ where: { id: input.serviceId, organizationId } });
    if (!service) throw new AppError('NOT_FOUND', 'Service not found.');
  }
  const { customer } = await upsertCustomer(scope, input.customer);
  const lead = await db.lead.create({
    data: {
      organizationId,
      customerId: customer.id,
      serviceId: input.serviceId ?? null,
      conversationId: input.conversationId ?? null,
      summary: input.summary,
      origin: input.origin as Origin,
    },
    select: { id: true },
  });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'lead.created',
    entityType: 'Lead',
    entityId: lead.id,
    metadata: { origin: input.origin, serviceId: input.serviceId ?? null },
  });
  return {
    result: lead,
    events: [
      domainEvent({
        type: 'lead.created',
        organizationId,
        leadId: lead.id,
        serviceId: input.serviceId ?? null,
        customerId: customer.id,
        conversationId: input.conversationId ?? null,
        channel: input.origin === 'EMAIL' ? 'EMAIL' : input.origin === 'CHAT' ? 'WEB_CHAT' : null,
      }),
    ],
  };
}

export async function listLeads(
  scope: TenantScope,
  ctx: ActorContext,
  query: { status?: LeadStatus[] } = {},
) {
  authorizeIn(scope, ctx, 'leads.view');
  return scope.db.lead.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(query.status ? { status: { in: query.status } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      service: { select: { id: true, name: true } },
      assignee: { select: { id: true, user: { select: { name: true } } } },
    },
    take: 200,
  });
}

const NEXT_STATUSES: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'WON', 'LOST'],
  CONTACTED: ['WON', 'LOST', 'NEW'],
  WON: ['CONTACTED'],
  LOST: ['CONTACTED'],
};

export async function updateLeadStatus(
  scope: TenantScope,
  ctx: ActorContext,
  leadId: string,
  status: LeadStatus,
) {
  authorizeIn(scope, ctx, 'leads.update');
  const lead = await scope.db.lead.findFirst({ where: { id: leadId, organizationId: scope.organizationId } });
  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
  if (lead.status === status) return;
  if (!NEXT_STATUSES[lead.status].includes(status)) {
    throw new AppError(
      'INVALID_STATE',
      `A ${lead.status.toLowerCase()} lead cannot move to ${status.toLowerCase()}.`,
    );
  }
  await scope.db.lead.update({
    where: { id: lead.id },
    data: { status, closedAt: status === 'WON' || status === 'LOST' ? new Date() : null },
  });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'lead.status_changed',
    entityType: 'Lead',
    entityId: lead.id,
    metadata: { from: lead.status, to: status },
  });
}

export async function assignLead(
  scope: TenantScope,
  ctx: ActorContext,
  leadId: string,
  membershipId: string | null,
) {
  authorizeIn(scope, ctx, 'leads.update');
  if (membershipId) {
    const member = await scope.db.membership.findFirst({
      where: { id: membershipId, organizationId: scope.organizationId },
    });
    if (!member) throw new AppError('NOT_FOUND', 'Team member not found.');
  }
  const { count } = await scope.db.lead.updateMany({
    where: { id: leadId, organizationId: scope.organizationId },
    data: { assigneeId: membershipId },
  });
  if (count === 0) throw new AppError('NOT_FOUND', 'Lead not found.');
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'lead.assigned',
    entityType: 'Lead',
    entityId: leadId,
    metadata: { membershipId },
  });
}
