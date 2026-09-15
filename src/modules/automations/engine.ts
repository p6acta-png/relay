import 'server-only';
import { z } from 'zod';
import type { Automation } from '@/generated/prisma/client';
import { PG_UNIQUE_VIOLATION, postgresErrorCode, withTenant, type TenantScope } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { automationActor, recordAudit } from '@/modules/audit/audit';
import { parseOpeningHours } from '@/modules/catalog/opening-hours';
import { addMessage, assignConversation, handOffConversation } from '@/modules/conversations/conversations';
import { assignLead } from '@/modules/crm/leads';
import { createTask } from '@/modules/crm/tasks';
import { isReturningCustomer } from '@/modules/customers/customers';
import type { DomainEvent } from '@/modules/events';
import { queueEmail } from '@/modules/notifications/email';
import { notify, resolveRecipients } from '@/modules/notifications/notifications';
import { authorizeIn, type AutomationContext } from '@/modules/tenancy/context';
import { automationDefinitionSchema, triggerForEvent, type Action } from './definitions';
import { evaluateConditions, renderTemplate, type EventContext } from './evaluate';

/**
 * The automation engine.
 *
 * Called with domain events after the transaction that produced them has committed. For each
 * enabled automation listening to the event's trigger it:
 *   1. re-validates the stored configuration,
 *   2. evaluates the conditions,
 *   3. claims the run — (automationId, eventId) is unique, so an event never runs twice,
 *   4. executes the actions one by one, each in its own transaction, through the same services
 *      staff use, with the automation's own least-privilege permissions,
 *   5. records every step's outcome and an audit entry.
 *
 * Events produced *by* actions (e.g. a hand-off) are not dispatched again: automations cannot
 * trigger automations, so loops are impossible by construction.
 */
export const runStepSchema = z.object({
  action: z.string(),
  status: z.enum(['succeeded', 'skipped', 'failed']),
  detail: z.string().max(300),
});
export type RunStep = z.infer<typeof runStepSchema>;

export type RunReport = {
  automationId: string;
  outcome: 'succeeded' | 'failed' | 'not_matched' | 'duplicate' | 'invalid';
};

export async function runAutomations(events: DomainEvent[]): Promise<RunReport[]> {
  const reports: RunReport[] = [];
  for (const event of events) {
    try {
      reports.push(...(await runForEvent(event)));
    } catch (error) {
      // An automation problem must never break the customer's booking or message.
      logger.error('automations.dispatch_failed', { eventType: event.type, error });
    }
  }
  return reports;
}

async function runForEvent(event: DomainEvent): Promise<RunReport[]> {
  const trigger = triggerForEvent(event.type);
  const automations = await withTenant(event.organizationId, ({ db, organizationId }) =>
    db.automation.findMany({
      where: { organizationId, trigger, enabled: true },
      orderBy: { createdAt: 'asc' },
    }),
  );
  if (automations.length === 0) return [];
  const context = await withTenant(event.organizationId, (scope) => loadEventContext(scope, event));

  const reports: RunReport[] = [];
  for (const automation of automations) reports.push(await runOne(automation, event, context));
  return reports;
}

// #region learn:run-automation
async function runOne(row: Automation, event: DomainEvent, context: EventContext): Promise<RunReport> {
  const organizationId = event.organizationId;
  const definition = automationDefinitionSchema.safeParse({
    name: row.name,
    trigger: row.trigger,
    conditions: row.conditions,
    actions: row.actions,
    enabled: row.enabled,
  });

  const links = {
    conversationId: context.conversation?.id ?? null,
    bookingId: context.booking?.id ?? null,
    leadId: context.lead?.id ?? null,
  };

  // 1–2. Validate configuration, then conditions.
  if (definition.success) {
    const conditions = evaluateConditions(definition.data.conditions, context);
    if (!conditions.matched) return { automationId: row.id, outcome: 'not_matched' };
  }

  // 3. Claim the run. A second delivery of the same event hits the unique constraint.
  let runId: string;
  try {
    runId = await withTenant(organizationId, async ({ db }) => {
      const run = await db.automationRun.create({
        data: {
          organizationId,
          automationId: row.id,
          eventId: event.id,
          trigger: row.trigger,
          status: 'RUNNING',
          ...links,
        },
        select: { id: true },
      });
      return run.id;
    });
  } catch (error) {
    if (postgresErrorCode(error) === PG_UNIQUE_VIOLATION)
      return { automationId: row.id, outcome: 'duplicate' };
    throw error;
  }

  const steps: RunStep[] = [];
  let failure: string | null = null;

  if (!definition.success) {
    failure = 'This automation’s settings are no longer valid. Open it and save it again.';
  } else {
    // 4. Execute actions with the automation's own identity and permissions.
    const ctx: AutomationContext = {
      kind: 'automation',
      organizationId,
      automationId: row.id,
      automationName: row.name,
    };
    for (const action of definition.data.actions) {
      if (failure) {
        steps.push({
          action: action.type,
          status: 'skipped',
          detail: 'Skipped because an earlier step failed.',
        });
        continue;
      }
      try {
        const outcome = await withTenant(organizationId, (scope) =>
          executeAction(scope, ctx, action, context),
        );
        steps.push({
          action: action.type,
          status: outcome.skipped ? 'skipped' : 'succeeded',
          detail: outcome.detail,
        });
      } catch (error) {
        failure = isAppError(error) ? error.message : 'Unexpected error while running this step.';
        if (!isAppError(error))
          logger.error('automations.action_failed', { automationId: row.id, action: action.type, error });
        steps.push({ action: action.type, status: 'failed', detail: failure.slice(0, 300) });
      }
    }
  }

  // 5. Record the outcome.
  await withTenant(organizationId, async (scope) => {
    await scope.db.automationRun.update({
      where: { id: runId },
      data: { status: failure ? 'FAILED' : 'SUCCEEDED', steps, error: failure, finishedAt: new Date() },
    });
    await recordAudit(scope, {
      actor: automationActor({ id: row.id, name: row.name }),
      action: 'automation.run',
      entityType: 'Automation',
      entityId: row.id,
      result: failure ? 'FAILURE' : 'SUCCESS',
      metadata: { runId, trigger: row.trigger, steps: steps.length },
    });
  });

  return {
    automationId: row.id,
    outcome: definition.success ? (failure ? 'failed' : 'succeeded') : 'invalid',
  };
}
// #endregion learn:run-automation

type ActionOutcome = { detail: string; skipped?: boolean };

// #region learn:execute-action
async function executeAction(
  scope: TenantScope,
  ctx: AutomationContext,
  action: Action,
  context: EventContext,
): Promise<ActionOutcome> {
  const link = context.conversation
    ? `/app/inbox/${context.conversation.id}`
    : context.booking
      ? `/app/bookings/${context.booking.id}`
      : context.lead
        ? '/app/leads'
        : undefined;

  switch (action.type) {
    case 'send_chat_reply': {
      authorizeIn(scope, ctx, 'inbox.reply');
      if (!context.conversation) return { detail: 'No conversation to reply in.', skipped: true };
      await addMessage(scope, {
        conversationId: context.conversation.id,
        author: 'ASSISTANT',
        body: renderTemplate(action.message, context),
      });
      return { detail: 'Reply sent in the chat.' };
    }
    case 'email_customer': {
      authorizeIn(scope, ctx, 'email.send');
      if (!context.customer?.email)
        return { detail: 'The customer has not given an email address.', skipped: true };
      await queueEmail(scope, {
        to: context.customer.email,
        subject: renderTemplate(action.subject, context),
        text: renderTemplate(action.body, context),
        related: context.booking
          ? { type: 'Booking', id: context.booking.id }
          : context.lead
            ? { type: 'Lead', id: context.lead.id }
            : undefined,
      });
      return { detail: 'Email placed in the outbox.' };
    }
    case 'notify_team': {
      authorizeIn(scope, ctx, 'notifications.send');
      const fromRoles = action.roles.length ? await resolveRecipients(scope, { roles: action.roles }) : [];
      const membershipIds = [...new Set([...fromRoles, ...action.membershipIds])];
      const count = await notify(
        scope,
        { membershipIds },
        { title: renderTemplate(action.message, context), href: link },
      );
      return { detail: `Notified ${count} team member${count === 1 ? '' : 's'}.`, skipped: count === 0 };
    }
    case 'create_task': {
      await createTask(scope, ctx, {
        title: renderTemplate(action.title, context),
        kind: action.kind,
        assigneeId: action.assigneeId,
        dueAt: action.dueInHours
          ? new Date(context.occurredAt.getTime() + action.dueInHours * 3_600_000)
          : null,
        conversationId: context.conversation?.id ?? null,
        bookingId: context.booking?.id ?? null,
        leadId: context.lead?.id ?? null,
      });
      return { detail: 'Task created.' };
    }
    case 'assign_to': {
      if (context.lead) {
        await assignLead(scope, ctx, context.lead.id, action.membershipId);
        return { detail: 'Lead assigned.' };
      }
      if (context.conversation) {
        await assignConversation(scope, ctx, context.conversation.id, action.membershipId);
        return { detail: 'Conversation assigned.' };
      }
      return { detail: 'Nothing to assign.', skipped: true };
    }
    case 'hand_off': {
      if (!context.conversation) return { detail: 'No conversation to hand over.', skipped: true };
      // The event this produces is intentionally not dispatched (no automation loops).
      await handOffConversation(scope, ctx, {
        conversationId: context.conversation.id,
        reason: 'automation_rule',
      });
      return { detail: 'Conversation handed to a person.' };
    }
  }
}
// #endregion learn:execute-action

export async function loadEventContext(scope: TenantScope, event: DomainEvent): Promise<EventContext> {
  const { db, organizationId } = scope;
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, timezone: true, openingHours: true },
  });

  const booking =
    'bookingId' in event
      ? await db.booking.findFirst({
          where: { id: event.bookingId, organizationId },
          select: { id: true, reference: true, startsAt: true, serviceId: true },
        })
      : null;
  const lead =
    'leadId' in event
      ? await db.lead.findFirst({
          where: { id: event.leadId, organizationId },
          select: { id: true, serviceId: true },
        })
      : null;

  const serviceId =
    ('serviceId' in event ? event.serviceId : null) ?? booking?.serviceId ?? lead?.serviceId ?? null;
  const service = serviceId
    ? await db.service.findFirst({
        where: { id: serviceId, organizationId },
        select: { id: true, name: true },
      })
    : null;

  const customer = event.customerId
    ? await db.customer.findFirst({
        where: { id: event.customerId, organizationId },
        select: { id: true, name: true, email: true },
      })
    : null;

  const conversation = event.conversationId
    ? await db.conversation.findFirst({
        where: { id: event.conversationId, organizationId },
        select: { id: true, channel: true },
      })
    : null;

  return {
    occurredAt: event.occurredAt,
    businessName: organization.name,
    timeZone: organization.timezone,
    openingHours: parseOpeningHours(organization.openingHours),
    channel: event.channel ?? conversation?.channel ?? null,
    service,
    customer: customer ? { ...customer, isReturning: await isReturningCustomer(scope, customer.id) } : null,
    conversation: conversation ? { id: conversation.id } : null,
    booking: booking ? { id: booking.id, reference: booking.reference, startsAt: booking.startsAt } : null,
    lead: lead ? { id: lead.id } : null,
  };
}
