import type { Permission } from '@/modules/tenancy/permissions';

export type NavIcon =
  | 'today'
  | 'inbox'
  | 'bookings'
  | 'leads'
  | 'tasks'
  | 'customers'
  | 'automations'
  | 'analytics'
  | 'audit'
  | 'setup';

export type NavCountKey = 'needsHuman' | 'pendingBookings' | 'openTasks' | 'newLeads';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  permission: Permission;
  count?: NavCountKey;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Daily work',
    items: [
      { href: '/app/today', label: 'Today', icon: 'today', permission: 'bookings.view' },
      { href: '/app/inbox', label: 'Inbox', icon: 'inbox', permission: 'inbox.view', count: 'needsHuman' },
      {
        href: '/app/bookings',
        label: 'Bookings',
        icon: 'bookings',
        permission: 'bookings.view',
        count: 'pendingBookings',
      },
      { href: '/app/leads', label: 'Leads', icon: 'leads', permission: 'leads.view', count: 'newLeads' },
      { href: '/app/tasks', label: 'Tasks', icon: 'tasks', permission: 'tasks.view', count: 'openTasks' },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/app/customers', label: 'Customers', icon: 'customers', permission: 'customers.view' },
      { href: '/app/automations', label: 'Automations', icon: 'automations', permission: 'automations.view' },
      { href: '/app/analytics', label: 'Analytics', icon: 'analytics', permission: 'analytics.view' },
      { href: '/app/audit', label: 'Audit log', icon: 'audit', permission: 'audit.view' },
      { href: '/app/setup', label: 'Setup', icon: 'setup', permission: 'setup.view' },
    ],
  },
];
