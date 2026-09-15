import { z } from 'zod';

/**
 * The contract between any AI provider and the rest of Relay.
 *
 * A provider — the built-in demo one or a real language model — may only answer with data in
 * this shape. It never replies to the customer directly and never changes anything itself:
 * the conversation flow decides what to do, and module services enforce every rule.
 */
export const INTENTS = [
  'greeting',
  'book',
  'ask_question',
  'request_quote',
  'cancel_booking',
  'talk_to_human',
  'thanks',
  'unknown',
] as const;

export const TOPICS = ['opening_hours', 'location', 'prices', 'contact', 'none'] as const;

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// #region learn:interpretation-schema
export const interpretationSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  /** Must be the id of one of the business's services that was offered to the provider. */
  serviceId: z.uuid().nullable(),
  /** Must be the id of one of the business's published knowledge items. */
  knowledgeItemId: z.uuid().nullable(),
  /** Questions answered from structured business settings rather than free-text FAQs. */
  topic: z.enum(TOPICS),
  time: z
    .object({
      dateFrom: localDate.nullable(),
      dateTo: localDate.nullable(),
      partOfDay: z.enum(['morning', 'afternoon', 'evening']).nullable(),
      /** Minutes after midnight, when the customer named a time ("at 14:00"). */
      exactMinute: z.int().min(0).max(1439).nullable(),
    })
    .nullable(),
  contact: z
    .object({
      email: z.email().nullable(),
      phone: z.string().max(30).nullable(),
    })
    .nullable(),
  /** One short line for staff: what Relay took from the message. Shown in the inbox. */
  summary: z.string().max(200),
  /** The words or rules that led to this reading — makes the demo AI explainable. */
  signals: z.array(z.string().max(60)).max(12),
});
// #endregion learn:interpretation-schema

export type Interpretation = z.infer<typeof interpretationSchema>;
export type Intent = Interpretation['intent'];
export type TimePreference = NonNullable<Interpretation['time']>;

export const UNKNOWN_INTERPRETATION: Interpretation = {
  intent: 'unknown',
  confidence: 0,
  serviceId: null,
  knowledgeItemId: null,
  topic: 'none',
  time: null,
  contact: null,
  summary: 'Not understood',
  signals: [],
};

/** What a provider is allowed to see: the message and the business's public catalogue. */
export interface InterpretationRequest {
  message: string;
  /** The business's local wall-clock time, e.g. "2026-09-14T10:00" — never the server's. */
  localNow: { date: string; minute: number };
  /** Where the conversation currently is, so "Tuesday" can be read as an answer to "when?". */
  step: string;
  services: { id: string; name: string; kind: 'BOOKABLE' | 'QUOTE'; keywords: string[] }[];
  knowledge: { id: string; question: string; keywords: string[] }[];
}
