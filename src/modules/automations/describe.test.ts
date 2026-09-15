import { describe, expect, it } from 'vitest';
import { automationDefinitionSchema } from './definitions';
import { describeAutomation } from './describe';
import { evaluateConditions, renderTemplate, type EventContext } from './evaluate';

const SERVICE = '0192f0a0-0000-7000-8000-000000000001';
const MEMBER = '0192f0a0-0000-7000-8000-000000000002';
const names = { services: { [SERVICE]: 'E-bike diagnostics' }, members: { [MEMBER]: 'Amina Berg' } };

describe('describeAutomation', () => {
  it('reads like a sentence', () => {
    expect(
      describeAutomation(
        {
          trigger: 'BOOKING_REQUESTED',
          conditions: [{ type: 'service_is', serviceIds: [SERVICE] }],
          actions: [
            { type: 'notify_team', roles: [], membershipIds: [MEMBER], message: 'x' },
            { type: 'create_task', title: 'x', kind: 'APPROVAL', dueInHours: 24, assigneeId: MEMBER },
          ],
        },
        names,
      ),
    ).toBe(
      'When a booking needs approval, if the service is E-bike diagnostics, then notify Amina Berg and create a task for Amina Berg due in 24 h.',
    );
  });
});

describe('automation definition validation', () => {
  const base = { name: 'Test', trigger: 'CONVERSATION_STARTED' as const, conditions: [], enabled: true };

  it('rejects actions that do not fit the trigger', () => {
    const result = automationDefinitionSchema.safeParse({
      ...base,
      actions: [{ type: 'assign_to', membershipId: MEMBER }],
      trigger: 'BOOKING_CONFIRMED',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/can’t be used with/);
  });

  it('rejects unknown placeholders in messages', () => {
    const result = automationDefinitionSchema.safeParse({
      ...base,
      actions: [{ type: 'send_chat_reply', message: 'Hi {{customer.password}}' }],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one action and a recipient for notifications', () => {
    expect(automationDefinitionSchema.safeParse({ ...base, actions: [] }).success).toBe(false);
    expect(
      automationDefinitionSchema.safeParse({
        ...base,
        actions: [{ type: 'notify_team', roles: [], membershipIds: [], message: 'Hi' }],
      }).success,
    ).toBe(false);
  });
});

describe('evaluateConditions and renderTemplate', () => {
  const context: EventContext = {
    occurredAt: new Date('2026-09-15T20:00:00Z'), // 22:00 in Oslo, after closing
    businessName: 'Eik & Kant',
    timeZone: 'Europe/Oslo',
    openingHours: [{ weekday: 2, opens: 540, closes: 1020 }],
    channel: 'WEB_CHAT',
    service: { id: SERVICE, name: 'E-bike diagnostics' },
    customer: { id: MEMBER, name: 'Kari Nordmann', email: 'kari@example.com', isReturning: false },
    conversation: null,
    booking: { id: SERVICE, reference: 'EK-7KQ3M', startsAt: new Date('2026-09-17T08:30:00Z') },
    lead: null,
  };

  it('matches when every condition holds and explains the first that does not', () => {
    expect(
      evaluateConditions(
        [
          { type: 'business_hours', value: 'closed' },
          { type: 'customer_is', value: 'new' },
        ],
        context,
      ),
    ).toEqual({ matched: true });
    expect(evaluateConditions([{ type: 'business_hours', value: 'open' }], context)).toEqual({
      matched: false,
      unmatched: 'business was closed',
    });
  });

  it('fills placeholders as plain text in the business’s time zone', () => {
    expect(
      renderTemplate('Hi {{customer.firstName}}, see you {{booking.when}} ({{booking.reference}})', context),
    ).toBe('Hi Kari, see you Thursday 17 September at 10:30 (EK-7KQ3M)');
    expect(renderTemplate('Reply to {{customer.name}}', { ...context, customer: null })).toBe(
      'Reply to a customer',
    );
  });
});
