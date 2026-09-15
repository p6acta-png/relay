import type { AutomationDefinition } from './definitions';

/**
 * Every new business starts with two automations, so nothing Relay hands over goes unnoticed.
 * They are ordinary automations: visible, editable and switchable in the builder.
 */
export function defaultAutomations(): AutomationDefinition[] {
  return [
    {
      name: 'Tell the team when Relay hands over',
      description: 'Anything Relay can’t handle becomes a task and a notification, so a person picks it up.',
      trigger: 'CONVERSATION_HANDED_OFF',
      conditions: [],
      actions: [
        {
          type: 'notify_team',
          roles: ['OWNER', 'ADMIN', 'STAFF'],
          membershipIds: [],
          message: 'A customer is waiting for a reply',
        },
        {
          type: 'create_task',
          title: 'Reply to {{customer.name}}',
          kind: 'HANDOFF',
          dueInHours: 4,
          assigneeId: null,
        },
      ],
      enabled: true,
    },
    {
      name: 'Ask for approval on booking requests',
      description: 'Services that need a person to confirm them show up as an approval task.',
      trigger: 'BOOKING_REQUESTED',
      conditions: [],
      actions: [
        {
          type: 'notify_team',
          roles: ['OWNER', 'ADMIN'],
          membershipIds: [],
          message: 'Booking request: {{service.name}}, {{booking.when}}',
        },
        {
          type: 'create_task',
          title: 'Approve or decline {{booking.reference}}',
          kind: 'APPROVAL',
          dueInHours: 24,
          assigneeId: null,
        },
      ],
      enabled: true,
    },
  ];
}
