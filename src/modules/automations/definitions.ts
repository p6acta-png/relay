import { z } from 'zod';
import type { AutomationTrigger } from '@/generated/prisma/enums';
import type { DomainEventType } from '@/modules/events';

/**
 * What an automation can be made of. A deliberately small vocabulary:
 * six triggers, four conditions, six actions — enough for real rules, small enough to explain.
 */

export const TRIGGERS: Record<AutomationTrigger, { label: string; event: DomainEventType; help: string }> = {
  CONVERSATION_STARTED: {
    label: 'A new conversation starts',
    event: 'conversation.started',
    help: 'Runs when a customer opens the chat or sends a first email.',
  },
  BOOKING_REQUESTED: {
    label: 'A booking needs approval',
    event: 'booking.requested',
    help: 'Runs when someone books a service that staff must approve.',
  },
  BOOKING_CONFIRMED: {
    label: 'A booking is confirmed',
    event: 'booking.confirmed',
    help: 'Runs for instant bookings and when staff approve a request.',
  },
  BOOKING_CANCELLED: {
    label: 'A booking is cancelled or declined',
    event: 'booking.cancelled',
    help: 'Runs when a customer or staff cancels, or a request is declined.',
  },
  LEAD_CREATED: {
    label: 'A new lead comes in',
    event: 'lead.created',
    help: 'Runs when a customer asks for a quote or something that needs a person to price.',
  },
  CONVERSATION_HANDED_OFF: {
    label: 'Relay hands a conversation to a person',
    event: 'conversation.handed_off',
    help: 'Runs when Relay can’t answer, a customer asks for a person, or a message looks like spam.',
  },
};

export function triggerForEvent(type: DomainEventType): AutomationTrigger {
  return Object.entries(TRIGGERS).find(([, t]) => t.event === type)![0] as AutomationTrigger;
}

const uuid = z.uuid();

// ─── Conditions ─────────────────────────────────────────────────────────────

export const conditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('service_is'),
    serviceIds: z.array(uuid).min(1, 'Choose at least one service.').max(20),
  }),
  z.object({ type: z.literal('business_hours'), value: z.enum(['open', 'closed']) }),
  z.object({ type: z.literal('customer_is'), value: z.enum(['new', 'returning']) }),
  z.object({ type: z.literal('channel_is'), value: z.enum(['WEB_CHAT', 'EMAIL']) }),
]);
export type Condition = z.infer<typeof conditionSchema>;

// ─── Actions ────────────────────────────────────────────────────────────────

/** Placeholders a business may use in messages. Anything else is rejected when saving. */
export const TEMPLATE_VARIABLES = [
  'customer.firstName',
  'customer.name',
  'business.name',
  'service.name',
  'booking.when',
  'booking.reference',
] as const;

const template = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Write a message.')
    .max(max)
    .refine(
      (text) =>
        [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].every((m) =>
          (TEMPLATE_VARIABLES as readonly string[]).includes(m[1]!),
        ),
      `Only these placeholders can be used: ${TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(', ')}.`,
    );

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send_chat_reply'), message: template(500) }),
  z.object({ type: z.literal('email_customer'), subject: template(150), body: template(2000) }),
  z.object({
    type: z.literal('notify_team'),
    roles: z
      .array(z.enum(['OWNER', 'ADMIN', 'STAFF']))
      .max(3)
      .default([]),
    membershipIds: z.array(uuid).max(20).default([]),
    message: template(200),
  }),
  z.object({
    type: z.literal('create_task'),
    title: template(160),
    kind: z.enum(['HANDOFF', 'APPROVAL', 'FOLLOW_UP', 'OTHER']).default('FOLLOW_UP'),
    dueInHours: z.int().min(1).max(336).nullable().default(null),
    assigneeId: uuid.nullable().default(null),
  }),
  z.object({ type: z.literal('assign_to'), membershipId: uuid }),
  z.object({ type: z.literal('hand_off') }),
]);
export type Action = z.infer<typeof actionSchema>;

// ─── Which pieces fit together ──────────────────────────────────────────────

const ALL_TRIGGERS = Object.keys(TRIGGERS) as AutomationTrigger[];
const BOOKING_TRIGGERS: AutomationTrigger[] = ['BOOKING_REQUESTED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED'];

export const CONDITION_TRIGGERS: Record<Condition['type'], AutomationTrigger[]> = {
  service_is: [...BOOKING_TRIGGERS, 'LEAD_CREATED'],
  business_hours: ALL_TRIGGERS,
  customer_is: [...BOOKING_TRIGGERS, 'LEAD_CREATED', 'CONVERSATION_HANDED_OFF'],
  channel_is: ['CONVERSATION_STARTED', 'CONVERSATION_HANDED_OFF', 'LEAD_CREATED'],
};

export const ACTION_TRIGGERS: Record<Action['type'], AutomationTrigger[]> = {
  send_chat_reply: [
    'CONVERSATION_STARTED',
    'CONVERSATION_HANDED_OFF',
    'BOOKING_REQUESTED',
    'BOOKING_CONFIRMED',
    'LEAD_CREATED',
  ],
  email_customer: [...BOOKING_TRIGGERS, 'LEAD_CREATED', 'CONVERSATION_HANDED_OFF'],
  notify_team: ALL_TRIGGERS,
  create_task: ALL_TRIGGERS,
  assign_to: ['CONVERSATION_STARTED', 'CONVERSATION_HANDED_OFF', 'LEAD_CREATED'],
  hand_off: ['CONVERSATION_STARTED'],
};

export const CONDITION_LABELS: Record<Condition['type'], string> = {
  service_is: 'Service is',
  business_hours: 'The business is',
  customer_is: 'Customer is',
  channel_is: 'Channel is',
};

export const ACTION_LABELS: Record<Action['type'], string> = {
  send_chat_reply: 'Send a chat reply',
  email_customer: 'Email the customer',
  notify_team: 'Notify the team',
  create_task: 'Create a task',
  assign_to: 'Assign to a team member',
  hand_off: 'Hand over to a person',
};

// #region learn:automation-schema
export const automationDefinitionSchema = z
  .object({
    name: z.string().trim().min(2, 'Name the automation.').max(80),
    description: z.string().trim().max(300).optional().default(''),
    trigger: z.enum(ALL_TRIGGERS as [AutomationTrigger, ...AutomationTrigger[]]),
    conditions: z.array(conditionSchema).max(4, 'Use at most four conditions.'),
    actions: z.array(actionSchema).min(1, 'Add at least one action.').max(5, 'Use at most five actions.'),
    enabled: z.boolean().default(true),
  })
  .superRefine((definition, ctx) => {
    definition.conditions.forEach((condition, index) => {
      if (!CONDITION_TRIGGERS[condition.type].includes(definition.trigger)) {
        ctx.addIssue({
          code: 'custom',
          path: ['conditions', index],
          message: `“${CONDITION_LABELS[condition.type]}” can’t be used with “${TRIGGERS[definition.trigger].label}”.`,
        });
      }
    });
    definition.actions.forEach((action, index) => {
      if (!ACTION_TRIGGERS[action.type].includes(definition.trigger)) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', index],
          message: `“${ACTION_LABELS[action.type]}” can’t be used with “${TRIGGERS[definition.trigger].label}”.`,
        });
      }
      if (action.type === 'notify_team' && action.roles.length === 0 && action.membershipIds.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['actions', index], message: 'Choose who to notify.' });
      }
    });
  });
// #endregion learn:automation-schema

export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;
