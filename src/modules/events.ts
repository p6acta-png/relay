import { randomUUID } from 'node:crypto';
import type { Channel } from '@/generated/prisma/enums';

/**
 * Domain events: facts about something that already happened ("a booking was confirmed").
 *
 * Services return events instead of calling other modules directly. After the transaction has
 * committed, the caller passes them to the automation engine. That keeps modules independent
 * and guarantees automations never react to a change that was rolled back.
 */
interface EventBase {
  id: string;
  organizationId: string;
  occurredAt: Date;
  conversationId?: string | null;
  customerId?: string | null;
  channel?: Channel | null;
}

export type DomainEvent =
  | (EventBase & { type: 'conversation.started'; conversationId: string })
  | (EventBase & { type: 'booking.requested'; bookingId: string; serviceId: string })
  | (EventBase & { type: 'booking.confirmed'; bookingId: string; serviceId: string })
  | (EventBase & {
      type: 'booking.cancelled';
      bookingId: string;
      serviceId: string;
      reason: 'customer' | 'staff' | 'declined';
    })
  | (EventBase & { type: 'lead.created'; leadId: string; serviceId?: string | null })
  | (EventBase & { type: 'conversation.handed_off'; conversationId: string; reason: HandoffReason });

export type HandoffReason =
  | 'unanswered_question'
  | 'customer_asked'
  | 'no_availability'
  | 'flagged'
  | 'staff_took_over'
  | 'automation_rule';

export type DomainEventType = DomainEvent['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function domainEvent(event: DistributiveOmit<DomainEvent, 'id' | 'occurredAt'>): DomainEvent {
  return { ...event, id: randomUUID(), occurredAt: new Date() } as DomainEvent;
}

/** A service result plus the events it produced. */
export interface WithEvents<T> {
  result: T;
  events: DomainEvent[];
}
