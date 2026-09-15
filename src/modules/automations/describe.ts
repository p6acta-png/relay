import {
  ACTION_LABELS,
  TRIGGERS,
  type Action,
  type AutomationDefinition,
  type Condition,
} from './definitions';

/**
 * Turns an automation into one plain sentence, so anyone on the team can read what it does:
 * "When a booking needs approval, if service is E-bike diagnostics, then notify Amina Berg and create a task."
 */
export interface Names {
  services: Record<string, string>;
  members: Record<string, string>;
}

const ROLE_NAMES = { OWNER: 'owners', ADMIN: 'admins', STAFF: 'staff' } as const;

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function describeCondition(condition: Condition, names: Names): string {
  switch (condition.type) {
    case 'service_is':
      return `the service is ${list(condition.serviceIds.map((id) => names.services[id] ?? 'a removed service'))}`;
    case 'business_hours':
      return condition.value === 'open' ? 'the business is open' : 'the business is closed';
    case 'customer_is':
      return condition.value === 'new' ? 'it’s a new customer' : 'it’s a returning customer';
    case 'channel_is':
      return condition.value === 'EMAIL' ? 'it came by email' : 'it came through the chat';
  }
}

export function describeAction(action: Action, names: Names): string {
  switch (action.type) {
    case 'send_chat_reply':
      return 'reply in the chat';
    case 'email_customer':
      return 'email the customer';
    case 'notify_team': {
      const who = [
        ...action.roles.map((r) => ROLE_NAMES[r]),
        ...action.membershipIds.map((id) => names.members[id] ?? 'a former team member'),
      ];
      return `notify ${list(who) || 'nobody'}`;
    }
    case 'create_task':
      return `create a task${action.assigneeId ? ` for ${names.members[action.assigneeId] ?? 'a former team member'}` : ''}${action.dueInHours ? ` due in ${action.dueInHours} h` : ''}`;
    case 'assign_to':
      return `assign it to ${names.members[action.membershipId] ?? 'a former team member'}`;
    case 'hand_off':
      return 'hand it to a person';
    default:
      return ACTION_LABELS[(action as Action).type].toLowerCase();
  }
}

export function describeAutomation(
  definition: Pick<AutomationDefinition, 'trigger' | 'conditions' | 'actions'>,
  names: Names,
): string {
  const label = TRIGGERS[definition.trigger].label;
  const when = label.startsWith('A ') ? `a ${label.slice(2)}` : label; // keeps "Relay" capitalised
  const conditions = definition.conditions.map((c) => describeCondition(c, names));
  const actions = definition.actions.map((a) => describeAction(a, names));
  return `When ${when}${conditions.length ? `, if ${list(conditions)}` : ''}, then ${list(actions) || '…'}.`;
}
