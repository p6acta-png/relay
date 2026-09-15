import { isOpenAt, type OpeningHours } from '@/modules/catalog/opening-hours';
import { formatInZone } from '@/lib/time';
import type { Condition } from './definitions';

/** Everything an automation may know about the event it reacts to. Loaded by the engine. */
export interface EventContext {
  occurredAt: Date;
  businessName: string;
  timeZone: string;
  openingHours: OpeningHours;
  channel: 'WEB_CHAT' | 'EMAIL' | null;
  service: { id: string; name: string } | null;
  customer: { id: string; name: string | null; email: string | null; isReturning: boolean } | null;
  conversation: { id: string } | null;
  booking: { id: string; reference: string; startsAt: Date } | null;
  lead: { id: string } | null;
}

export interface ConditionResult {
  matched: boolean;
  /** Human-readable reason for the first condition that did not match. */
  unmatched?: string;
}

// #region learn:evaluate-conditions
export function evaluateConditions(conditions: Condition[], context: EventContext): ConditionResult {
  for (const condition of conditions) {
    switch (condition.type) {
      case 'service_is':
        if (!context.service || !condition.serviceIds.includes(context.service.id)) {
          return { matched: false, unmatched: 'service did not match' };
        }
        break;
      case 'business_hours': {
        const open = isOpenAt(context.openingHours, context.occurredAt, context.timeZone);
        if ((condition.value === 'open') !== open) {
          return { matched: false, unmatched: `business was ${open ? 'open' : 'closed'}` };
        }
        break;
      }
      case 'customer_is': {
        const returning = context.customer?.isReturning ?? false;
        if ((condition.value === 'returning') !== returning) {
          return { matched: false, unmatched: `customer is ${returning ? 'returning' : 'new'}` };
        }
        break;
      }
      case 'channel_is':
        if (context.channel !== condition.value) return { matched: false, unmatched: 'different channel' };
        break;
    }
  }
  return { matched: true };
}
// #endregion learn:evaluate-conditions

/**
 * Fills {{placeholders}} from a fixed list. Values are inserted as plain text — the result is
 * never interpreted as HTML or code, and unknown placeholders become empty.
 */
export function renderTemplate(template: string, context: EventContext): string {
  const values: Record<string, string> = {
    'customer.firstName': context.customer?.name?.split(' ')[0] ?? 'there',
    'customer.name': context.customer?.name ?? 'a customer',
    'business.name': context.businessName,
    'service.name': context.service?.name ?? 'your service',
    'booking.when': context.booking
      ? formatInZone(context.booking.startsAt, context.timeZone, "EEEE d MMMM 'at' HH:mm")
      : '',
    'booking.reference': context.booking?.reference ?? '',
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
}
