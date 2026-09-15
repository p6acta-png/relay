import { describe, expect, it } from 'vitest';
import { authorize, isAllowed, type ActorContext } from './context';
import { can, canManageRole, ROLE_PERMISSIONS, type Permission } from './permissions';

const ORG = '0192f0a0-0000-7000-8000-000000000001';

describe('role permissions', () => {
  it('lets owners do everything', () => {
    for (const permission of Object.keys(ROLE_PERMISSIONS) as Permission[]) {
      expect(can('OWNER', permission)).toBe(true);
    }
  });

  it('keeps staff out of configuration, audit and analytics', () => {
    const denied: Permission[] = [
      'setup.manage',
      'automations.manage',
      'team.manage',
      'audit.view',
      'analytics.view',
      'customers.erase',
      'outbox.view',
      'organization.manage',
    ];
    for (const permission of denied) expect(can('STAFF', permission)).toBe(false);
  });

  it('lets staff do the daily work', () => {
    const allowed: Permission[] = [
      'inbox.reply',
      'bookings.create',
      'bookings.decide',
      'leads.update',
      'tasks.update',
    ];
    for (const permission of allowed) expect(can('STAFF', permission)).toBe(true);
  });

  it('reserves organization-level changes for owners', () => {
    expect(can('ADMIN', 'organization.manage')).toBe(false);
    expect(can('ADMIN', 'setup.manage')).toBe(true);
  });

  it('prevents admins from managing owners and staff from managing anyone', () => {
    expect(canManageRole('OWNER', 'OWNER')).toBe(true);
    expect(canManageRole('ADMIN', 'OWNER')).toBe(false);
    expect(canManageRole('ADMIN', 'ADMIN')).toBe(true);
    expect(canManageRole('ADMIN', 'STAFF')).toBe(true);
    expect(canManageRole('STAFF', 'STAFF')).toBe(false);
  });
});

describe('non-human actors (least privilege)', () => {
  const assistant: ActorContext = { kind: 'assistant', organizationId: ORG, conversationId: ORG };
  const automation: ActorContext = {
    kind: 'automation',
    organizationId: ORG,
    automationId: ORG,
    automationName: 'Test',
  };
  const customer: ActorContext = { kind: 'customer', organizationId: ORG, customerId: null };

  it('lets the assistant propose bookings and hand off, but never decide, cancel or configure', () => {
    expect(isAllowed(assistant, 'bookings.create')).toBe(true);
    expect(isAllowed(assistant, 'conversations.handoff')).toBe(true);
    for (const permission of [
      'bookings.decide',
      'bookings.cancel',
      'setup.manage',
      'automations.manage',
      'customers.erase',
    ] as const) {
      expect(isAllowed(assistant, permission)).toBe(false);
    }
  });

  it('keeps automations away from bookings and configuration', () => {
    expect(isAllowed(automation, 'tasks.create')).toBe(true);
    expect(isAllowed(automation, 'bookings.create')).toBe(false);
    expect(isAllowed(automation, 'bookings.cancel')).toBe(false);
    expect(isAllowed(automation, 'automations.manage')).toBe(false);
  });

  it('only lets customers cancel bookings', () => {
    expect(isAllowed(customer, 'bookings.cancel')).toBe(true);
    expect(isAllowed(customer, 'bookings.view')).toBe(false);
    expect(() => authorize(customer, 'inbox.view')).toThrow(/permission/);
  });
});
