import type { Role } from '@/generated/prisma/enums';

/**
 * The single source of truth for what each role may do.
 *
 * Every service function that changes business data calls `authorize()` with one of these
 * permissions before doing any work — whether the request came from the dashboard, the chat,
 * or an automation. Hiding buttons in the UI is only a convenience; this check is the real one.
 */
// #region learn:permissions
const ALL: readonly Role[] = ['OWNER', 'ADMIN', 'STAFF'];
const MANAGERS: readonly Role[] = ['OWNER', 'ADMIN'];

export const ROLE_PERMISSIONS = {
  'inbox.view': ALL,
  'inbox.reply': ALL,
  'inbox.assign': ALL,
  'conversations.handoff': ALL,
  'bookings.view': ALL,
  'bookings.create': ALL,
  'bookings.decide': ALL,
  'bookings.cancel': ALL,
  'bookings.reschedule': ALL,
  'leads.view': ALL,
  'leads.create': ALL,
  'leads.update': ALL,
  'tasks.view': ALL,
  'tasks.create': ALL,
  'tasks.update': ALL,
  'customers.view': ALL,
  'customers.erase': MANAGERS,
  'automations.view': ALL,
  'automations.manage': MANAGERS,
  'analytics.view': MANAGERS,
  'audit.view': MANAGERS,
  'setup.view': ALL,
  'setup.manage': MANAGERS,
  'team.view': ALL,
  'team.manage': MANAGERS,
  'outbox.view': MANAGERS,
  'notifications.send': ALL,
  'email.send': ALL,
  'organization.manage': ['OWNER'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof ROLE_PERMISSIONS;

/**
 * Non-human actors get short, explicit allowlists (least privilege).
 * The assistant can propose a booking or hand a conversation to a person, but it can never
 * approve, cancel or reconfigure anything. Automations can notify and create tasks, but cannot
 * touch bookings. Customers can only cancel their own booking (ownership is proven by a token).
 */
export const MACHINE_PERMISSIONS = {
  ASSISTANT: [
    'inbox.reply',
    'bookings.create',
    'leads.create',
    'tasks.create',
    'conversations.handoff',
    'notifications.send',
    'email.send',
  ],
  AUTOMATION: [
    'inbox.reply',
    'inbox.assign',
    'leads.update',
    'tasks.create',
    'conversations.handoff',
    'notifications.send',
    'email.send',
  ],
  CUSTOMER: ['bookings.cancel'],
} as const satisfies Record<string, readonly Permission[]>;
// #endregion learn:permissions

export function can(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function machineCan(kind: keyof typeof MACHINE_PERMISSIONS, permission: Permission): boolean {
  return (MACHINE_PERMISSIONS[kind] as readonly Permission[]).includes(permission);
}

/**
 * Who may give or take away which role.
 * - Owners manage everyone, including other owners.
 * - Admins manage admins and staff, but never owners.
 * - Staff manage nobody.
 */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return target !== 'OWNER';
  return false;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  STAFF: 'Staff',
};
