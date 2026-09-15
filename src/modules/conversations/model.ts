import { z } from 'zod';

/**
 * The shapes that travel between the chat widget, the conversation flow and the database.
 * Everything here is validated with Zod both when it arrives from the browser and when it is
 * read back from JSON columns — stored JSON is not trusted blindly either.
 */

const uuid = z.uuid();
const isoInstant = z.iso.datetime({ offset: true });

// ─── Customer input (what the browser may send) ────────────────────────────

export const MAX_MESSAGE_LENGTH = 1000;

const contactFields = {
  name: z.string().max(80).optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
};

export const customerInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }),
  z.object({ kind: z.literal('choose_service'), serviceId: uuid }),
  z.object({ kind: z.literal('choose_slot'), slotId: z.string().regex(/^s\d{1,2}$/) }),
  z.object({ kind: z.literal('more_times') }),
  z.object({ kind: z.literal('submit_details'), ...contactFields }),
  z.object({ kind: z.literal('confirm_booking') }),
  z.object({ kind: z.literal('change_time') }),
  z.object({ kind: z.literal('talk_to_human') }),
  z.object({ kind: z.literal('start_over') }),
]);

export type CustomerInput = z.infer<typeof customerInputSchema>;

// ─── Conversation state (where the assistant is in its flow) ────────────────

const timePreferenceSchema = z.object({
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  partOfDay: z.enum(['morning', 'afternoon', 'evening']).nullable(),
  exactMinute: z.number().nullable(),
});

const offeredSlotSchema = z.object({ id: z.string(), startsAt: isoInstant, staffMemberId: uuid });

const contactSchema = z.object({ name: z.string(), email: z.string(), phone: z.string().optional() });

export const assistantStateSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('idle'), misunderstood: z.number().int().min(0).default(0) }),
  z.object({ step: z.literal('booking.service'), time: timePreferenceSchema.nullable() }),
  z.object({
    step: z.literal('booking.slot'),
    serviceId: uuid,
    time: timePreferenceSchema.nullable(),
    offered: z.array(offeredSlotSchema).max(12),
    /** Search further ahead when the customer asks for more times. */
    searchFrom: z.string().nullable(),
  }),
  z.object({ step: z.literal('booking.details'), serviceId: uuid, slot: offeredSlotSchema }),
  z.object({
    step: z.literal('booking.confirm'),
    serviceId: uuid,
    slot: offeredSlotSchema,
    contact: contactSchema,
  }),
  z.object({
    step: z.literal('quote.details'),
    serviceId: uuid.nullable(),
    description: z.string().max(1000),
  }),
  z.object({ step: z.literal('handoff.contact') }),
  z.object({ step: z.literal('handed_off') }),
]);

export type AssistantState = z.infer<typeof assistantStateSchema>;
export type OfferedSlot = z.infer<typeof offeredSlotSchema>;
export type Contact = z.infer<typeof contactSchema>;

export const IDLE_STATE: AssistantState = { step: 'idle', misunderstood: 0 };

export function parseState(value: unknown): AssistantState {
  const result = assistantStateSchema.safeParse(value);
  return result.success ? result.data : IDLE_STATE;
}

// ─── Reply blocks (structured UI under an assistant message) ────────────────

const quickReplySchema = z.object({ label: z.string().max(60), input: customerInputSchema });

export const replyBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quick_replies'), options: z.array(quickReplySchema).max(6) }),
  z.object({
    type: z.literal('service_options'),
    services: z
      .array(z.object({ id: uuid, name: z.string(), detail: z.string(), quote: z.boolean() }))
      .max(12),
  }),
  z.object({
    type: z.literal('slot_options'),
    days: z
      .array(
        z.object({
          label: z.string(),
          slots: z.array(z.object({ id: z.string(), time: z.string() })).max(6),
        }),
      )
      .max(7),
    canShowMore: z.boolean(),
  }),
  z.object({
    type: z.literal('details_form'),
    purpose: z.enum(['booking', 'quote', 'handoff']),
    requirePhone: z.boolean(),
    prefill: z.object({ name: z.string(), email: z.string(), phone: z.string() }).partial(),
    errors: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal('booking_summary'),
    service: z.string(),
    when: z.string(),
    staff: z.string().nullable(),
    price: z.string().nullable(),
    needsApproval: z.boolean(),
    contact: z.string(),
  }),
  z.object({
    type: z.literal('booking_result'),
    status: z.enum(['CONFIRMED', 'PENDING']),
    reference: z.string(),
    service: z.string(),
    when: z.string(),
  }),
  z.object({ type: z.literal('source'), label: z.string().max(120) }),
  z.object({ type: z.literal('handoff_notice'), replyWithinHours: z.number() }),
]);

export type ReplyBlock = z.infer<typeof replyBlockSchema>;

export interface AssistantReply {
  body: string;
  blocks: ReplyBlock[];
}

export const replyBlocksSchema = z.array(replyBlockSchema);
