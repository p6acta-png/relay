import type { HandoffReason } from '@/modules/events';
import type { Interpretation, TimePreference } from '@/modules/assistant/interpretation';
import { customerDetailsSchema } from '@/modules/customers/schemas';
import { addDays, formatInZone, toLocalDate, type LocalDate } from '@/lib/time';
import { fieldErrorsFrom } from '@/lib/errors';
import { pickSlotsToOffer } from '@/modules/scheduling/slots';
import type {
  AssistantReply,
  AssistantState,
  Contact,
  CustomerInput,
  OfferedSlot,
  ReplyBlock,
} from './model';
import { IDLE_STATE } from './model';

/**
 * The conversation flow: given where the conversation is, what the customer did, and what the
 * AI understood, decide what Relay says next and which actions to request.
 *
 * Deliberately deterministic. The AI only supplies an interpretation; this code decides.
 * Side effects (finding slots, creating a booking or lead, handing over) go through `ports`,
 * which the pipeline implements with real services — each with its own authorization and
 * validation. In tests, ports are simple fakes.
 */

export interface FlowService {
  id: string;
  name: string;
  kind: 'BOOKABLE' | 'QUOTE';
  description: string;
  durationMinutes: number | null;
  priceMinor: number | null;
  priceIsFrom: boolean;
  confirmationMode: 'INSTANT' | 'APPROVAL';
}

export interface FlowBusiness {
  name: string;
  timeZone: string;
  openingHoursLines: string[];
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  handoffReplyHours: number;
  cancellationWindowHours: number;
  services: FlowService[];
  knowledge: { id: string; question: string; answer: string }[];
}

export interface SlotCandidate {
  startsAt: Date;
  staffMemberId: string;
}

export type BookingOutcome =
  | { ok: true; reference: string; status: 'CONFIRMED' | 'PENDING' }
  | { ok: false; reason: 'taken' | 'invalid'; message: string };

export interface FlowPorts {
  findSlots(params: {
    serviceId: string;
    time: TimePreference | null;
    searchFrom: LocalDate | null;
  }): Promise<{
    slots: SlotCandidate[];
    matchedPreference: boolean;
  }>;
  createBooking(params: { serviceId: string; slot: OfferedSlot; contact: Contact }): Promise<BookingOutcome>;
  createLead(params: { serviceId: string | null; description: string; contact: Contact }): Promise<void>;
  handOff(reason: HandoffReason): Promise<void>;
  attachContact(contact: Contact): Promise<void>;
  knownContact(): Partial<Contact> | null;
}

export interface FlowResult {
  replies: AssistantReply[];
  state: AssistantState;
  bookingIntent: boolean;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatPrice(service: Pick<FlowService, 'priceMinor' | 'priceIsFrom'>): string | null {
  if (service.priceMinor === null) return null;
  const amount = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(
    service.priceMinor / 100,
  );
  return `${service.priceIsFrom ? 'from ' : ''}${amount} kr`;
}

function serviceDetail(service: FlowService): string {
  if (service.kind === 'QUOTE') return 'Needs a quote first';
  return [service.durationMinutes ? `about ${service.durationMinutes} min` : null, formatPrice(service)]
    .filter(Boolean)
    .join(' · ');
}

function describeTime(time: TimePreference | null, timeZone: string): string {
  if (!time) return '';
  const parts: string[] = [];
  if (time.dateFrom && time.dateFrom === time.dateTo) {
    parts.push(`on ${formatInZone(new Date(`${time.dateFrom}T12:00:00Z`), timeZone, 'EEEE d MMMM')}`);
  } else if (time.dateFrom) {
    parts.push(
      `between ${formatInZone(new Date(`${time.dateFrom}T12:00:00Z`), timeZone, 'd MMM')} and ${formatInZone(new Date(`${time.dateTo}T12:00:00Z`), timeZone, 'd MMM')}`,
    );
  }
  if (time.partOfDay) parts.push(`in the ${time.partOfDay}`);
  if (time.exactMinute !== null) {
    parts.push(
      `around ${String(Math.floor(time.exactMinute / 60)).padStart(2, '0')}:${String(time.exactMinute % 60).padStart(2, '0')}`,
    );
  }
  return parts.join(' ');
}

const firstName = (name?: string) => name?.split(' ')[0] ?? '';

const quick = (label: string, input: CustomerInput) => ({ label, input });

function defaultSuggestions(): ReplyBlock {
  return {
    type: 'quick_replies',
    options: [
      quick('Book a time', { kind: 'text', text: 'I’d like to book a time' }),
      quick('Prices', { kind: 'text', text: 'What are your prices?' }),
      quick('Opening hours', { kind: 'text', text: 'When are you open?' }),
      quick('Talk to a person', { kind: 'talk_to_human' }),
    ],
  };
}

export function welcomeReply(business: Pick<FlowBusiness, 'name'>): AssistantReply {
  return {
    body: `Hi! I’m the automated assistant for ${business.name}. I can book you in, answer questions about prices and opening hours, or pass you to someone at the workshop.`,
    blocks: [defaultSuggestions()],
  };
}

// ─── The flow ───────────────────────────────────────────────────────────────

// #region learn:run-flow
export async function runFlow(
  state: AssistantState,
  input: CustomerInput,
  interpretation: Interpretation | null,
  business: FlowBusiness,
  ports: FlowPorts,
): Promise<FlowResult> {
  const flow = new Flow(state, business, ports);

  switch (input.kind) {
    case 'text':
      return flow.onText(input.text, interpretation!);
    case 'choose_service':
      return flow.onChooseService(input.serviceId);
    case 'choose_slot':
      return flow.onChooseSlot(input.slotId);
    case 'more_times':
      return state.step === 'booking.slot'
        ? flow.offerSlots(state.serviceId, null, state.searchFrom)
        : flow.clarify();
    case 'change_time':
      return 'serviceId' in state && state.serviceId
        ? flow.offerSlots(
            state.serviceId,
            null,
            'slot' in state ? toLocalDate(new Date(state.slot.startsAt), business.timeZone) : null,
          )
        : flow.clarify();
    case 'submit_details':
      return flow.onDetails(input);
    case 'confirm_booking':
      return flow.onConfirm();
    case 'talk_to_human':
      return flow.handOff('customer_asked');
    case 'start_over':
      return { replies: [welcomeReply(business)], state: IDLE_STATE, bookingIntent: false };
  }
}
// #endregion learn:run-flow

class Flow {
  constructor(
    private state: AssistantState,
    private business: FlowBusiness,
    private ports: FlowPorts,
  ) {}

  private service(id: string | null | undefined) {
    return id ? this.business.services.find((s) => s.id === id) : undefined;
  }

  private result(replies: AssistantReply[], state: AssistantState, bookingIntent = false): FlowResult {
    return { replies, state, bookingIntent };
  }

  async onText(text: string, interpretation: Interpretation): Promise<FlowResult> {
    const state = this.state;
    const serviceInFlow = 'serviceId' in state ? state.serviceId : null;

    switch (interpretation.intent) {
      case 'talk_to_human':
        return this.handOff('customer_asked');

      case 'cancel_booking':
        return this.result(
          [
            {
              body: `You can cancel or change a booking with the link in your confirmation email — online cancellation works up to ${this.business.cancellationWindowHours} hours before. If you can’t find the email, I can pass you to the workshop.`,
              blocks: [
                { type: 'quick_replies', options: [quick('Talk to a person', { kind: 'talk_to_human' })] },
              ],
            },
          ],
          state,
        );

      case 'request_quote':
        return this.startQuote(interpretation.serviceId ?? serviceInFlow, text);

      case 'book': {
        const serviceId = interpretation.serviceId ?? serviceInFlow;
        if (!serviceId && state.step === 'booking.service' && !interpretation.time)
          return this.askForService(null);
        return this.startBooking(
          serviceId,
          interpretation.time ?? (state.step === 'booking.service' ? state.time : null),
        );
      }

      case 'ask_question':
        return this.answer(interpretation);

      case 'greeting':
        return this.result(
          [{ body: `Hi! What can I help you with?`, blocks: [defaultSuggestions()] }],
          state.step === 'idle' ? IDLE_STATE : state,
        );

      case 'thanks':
        return this.result([{ body: 'You’re welcome! Anything else I can help with?', blocks: [] }], state);

      case 'unknown':
        return this.onUnknown(text, interpretation);
    }
  }

  private async onUnknown(text: string, interpretation: Interpretation): Promise<FlowResult> {
    const state = this.state;
    switch (state.step) {
      case 'booking.slot':
        return this.result(
          [
            {
              body: 'Pick one of the times above, or tell me a day and time that suits you better.',
              blocks: [],
            },
          ],
          state,
          true,
        );
      case 'booking.details':
      case 'handoff.contact': {
        const prefill = {
          ...this.ports.knownContact(),
          ...(interpretation.contact?.email ? { email: interpretation.contact.email } : {}),
          ...(interpretation.contact?.phone ? { phone: interpretation.contact.phone } : {}),
        };
        return this.result(
          [
            {
              body: 'Please fill in the form so I get your details exactly right.',
              blocks: [this.detailsForm(state.step === 'booking.details' ? 'booking' : 'handoff', prefill)],
            },
          ],
          state,
          state.step === 'booking.details',
        );
      }
      case 'booking.confirm':
        return this.result(
          [{ body: 'Shall I confirm the booking above?', blocks: [this.confirmButtons()] }],
          state,
          true,
        );
      case 'quote.details':
        return this.result(
          [
            {
              body: 'Got it — I’ve added that to your request. Now just leave your details below.',
              blocks: [this.detailsForm('quote', this.ports.knownContact() ?? {})],
            },
          ],
          { ...state, description: `${state.description}\n${text}`.slice(0, 1000) },
        );
      default: {
        const misunderstood = (state.step === 'idle' ? state.misunderstood : 0) + 1;
        if (misunderstood >= 2) return this.handOff('unanswered_question');
        return this.result(
          [
            {
              body: 'Sorry, I didn’t quite get that. I can book a time, answer questions about prices and opening hours, or pass you to a person.',
              blocks: [defaultSuggestions()],
            },
          ],
          { step: 'idle', misunderstood },
        );
      }
    }
  }

  async onChooseService(serviceId: string): Promise<FlowResult> {
    const service = this.service(serviceId);
    if (!service) return this.askForService(null);
    if (service.kind === 'QUOTE') return this.startQuote(service.id, `Quote request: ${service.name}`);
    return this.offerSlots(service.id, this.state.step === 'booking.service' ? this.state.time : null, null);
  }

  private async startBooking(serviceId: string | null, time: TimePreference | null): Promise<FlowResult> {
    const service = this.service(serviceId);
    if (!service) return this.askForService(time);
    if (service.kind === 'QUOTE') return this.startQuote(service.id, `Quote request: ${service.name}`);
    return this.offerSlots(service.id, time, null);
  }

  private askForService(time: TimePreference | null): FlowResult {
    return this.result(
      [
        {
          body: 'Happy to book you in. Which service is it for?',
          blocks: [
            {
              type: 'service_options',
              services: this.business.services.map((s) => ({
                id: s.id,
                name: s.name,
                detail: serviceDetail(s),
                quote: s.kind === 'QUOTE',
              })),
            },
          ],
        },
      ],
      { step: 'booking.service', time },
      true,
    );
  }

  // #region learn:offer-slots
  async offerSlots(
    serviceId: string,
    time: TimePreference | null,
    searchFrom: LocalDate | null,
  ): Promise<FlowResult> {
    const service = this.service(serviceId);
    if (!service) return this.askForService(time);

    const { slots, matchedPreference } = await this.ports.findSlots({ serviceId, time, searchFrom });
    if (slots.length === 0) {
      const handedOff = await this.handOff('no_availability');
      handedOff.replies.unshift({
        body: `I can’t find a free time for ${service.name} in the next two weeks.`,
        blocks: [],
      });
      return handedOff;
    }

    const tz = this.business.timeZone;
    const picked = pickSlotsToOffer(
      slots.map((s) => ({ ...s, endsAt: s.startsAt, alternatives: [s.staffMemberId] })),
      tz,
      6,
      3,
    );
    const offered: OfferedSlot[] = picked.map((s, i) => ({
      id: `s${i + 1}`,
      startsAt: s.startsAt.toISOString(),
      staffMemberId: s.staffMemberId,
    }));

    const days = new Map<string, { id: string; time: string }[]>();
    for (const slot of offered) {
      const label = formatInZone(new Date(slot.startsAt), tz, 'EEEE d MMMM');
      days.set(label, [
        ...(days.get(label) ?? []),
        { id: slot.id, time: formatInZone(new Date(slot.startsAt), tz, 'HH:mm') },
      ]);
    }

    const when = describeTime(time, tz);
    const intro = !time
      ? searchFrom
        ? 'Here are some later times:'
        : `Here are the next free times for ${service.name}:`
      : matchedPreference
        ? `These times are free for ${service.name} ${when}:`
        : `Nothing is free ${when}, but these times are close:`;
    const detail = serviceDetail(service);
    const approval =
      service.confirmationMode === 'APPROVAL' ? ' The workshop confirms this service personally.' : '';

    const lastDate = toLocalDate(new Date(offered.at(-1)!.startsAt), tz);
    return this.result(
      [
        {
          body: `${intro}${detail ? `\n${detail.charAt(0).toUpperCase()}${detail.slice(1)}.${approval}` : ''}`,
          blocks: [
            {
              type: 'slot_options',
              days: [...days].map(([label, s]) => ({ label, slots: s })),
              canShowMore: true,
            },
          ],
        },
      ],
      { step: 'booking.slot', serviceId, time, offered, searchFrom: addDays(lastDate, 1) },
      true,
    );
  }
  // #endregion learn:offer-slots

  async onChooseSlot(slotId: string): Promise<FlowResult> {
    const state = this.state;
    if (state.step !== 'booking.slot') return this.clarify();
    const slot = state.offered.find((s) => s.id === slotId);
    // Customers can only pick a time the server offered them — never an arbitrary timestamp.
    if (!slot) return this.offerSlots(state.serviceId, state.time, null);

    const when = formatInZone(new Date(slot.startsAt), this.business.timeZone, "EEEE d MMMM 'at' HH:mm");
    const known = this.ports.knownContact();
    if (known?.name && known.email) {
      return this.confirmStep(state.serviceId, slot, {
        name: known.name,
        email: known.email,
        phone: known.phone,
      });
    }
    return this.result(
      [
        {
          body: `${when} — great choice. Who is the booking for?`,
          blocks: [this.detailsForm('booking', known ?? {})],
        },
      ],
      { step: 'booking.details', serviceId: state.serviceId, slot },
      true,
    );
  }

  async onDetails(input: Extract<CustomerInput, { kind: 'submit_details' }>): Promise<FlowResult> {
    const state = this.state;
    const purpose =
      state.step === 'booking.details'
        ? 'booking'
        : state.step === 'quote.details'
          ? 'quote'
          : state.step === 'handoff.contact'
            ? 'handoff'
            : null;
    if (!purpose) return this.clarify();

    const parsed = customerDetailsSchema.safeParse({
      name: input.name ?? '',
      email: input.email ?? '',
      phone: input.phone ?? '',
    });
    if (!parsed.success) {
      return this.result(
        [
          {
            body: 'Please check the highlighted fields.',
            blocks: [
              this.detailsForm(
                purpose,
                { name: input.name, email: input.email, phone: input.phone },
                fieldErrorsFrom(parsed.error.issues),
              ),
            ],
          },
        ],
        state,
        purpose === 'booking',
      );
    }
    const contact: Contact = {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
    };
    await this.ports.attachContact(contact);

    if (state.step === 'booking.details') return this.confirmStep(state.serviceId, state.slot, contact);

    if (state.step === 'quote.details') {
      await this.ports.createLead({ serviceId: state.serviceId, description: state.description, contact });
      return this.result(
        [
          {
            body: `Thanks, ${firstName(contact.name)}. I’ve sent your request to ${this.business.name} — they usually get back to you within ${this.business.handoffReplyHours} hours, by email to ${contact.email}.`,
            blocks: [],
          },
        ],
        IDLE_STATE,
      );
    }

    return this.result(
      [
        {
          body: `Thanks, ${firstName(contact.name)}. Someone from ${this.business.name} will reply here, or by email to ${contact.email} if you’ve left.`,
          blocks: [],
        },
      ],
      { step: 'handed_off' },
    );
  }

  private confirmStep(serviceId: string, slot: OfferedSlot, contact: Contact): FlowResult {
    const service = this.service(serviceId)!;
    return this.result(
      [
        {
          body:
            service.confirmationMode === 'APPROVAL'
              ? 'Here’s your request. Shall I send it?'
              : 'Here’s your booking. Shall I confirm it?',
          blocks: [
            {
              type: 'booking_summary',
              service: service.name,
              when: formatInZone(new Date(slot.startsAt), this.business.timeZone, "EEEE d MMMM 'at' HH:mm"),
              staff: null,
              price: formatPrice(service),
              needsApproval: service.confirmationMode === 'APPROVAL',
              contact: [contact.name, contact.email, contact.phone].filter(Boolean).join(' · '),
            },
            this.confirmButtons(service.confirmationMode === 'APPROVAL'),
          ],
        },
      ],
      { step: 'booking.confirm', serviceId, slot, contact },
      true,
    );
  }

  private confirmButtons(approval = false): ReplyBlock {
    return {
      type: 'quick_replies',
      options: [
        quick(approval ? 'Send request' : 'Confirm booking', { kind: 'confirm_booking' }),
        quick('Choose another time', { kind: 'change_time' }),
      ],
    };
  }

  // #region learn:confirm-booking
  async onConfirm(): Promise<FlowResult> {
    const state = this.state;
    if (state.step !== 'booking.confirm') return this.clarify();
    const service = this.service(state.serviceId)!;

    const outcome = await this.ports.createBooking({
      serviceId: state.serviceId,
      slot: state.slot,
      contact: state.contact,
    });
    if (!outcome.ok) {
      const retry = await this.offerSlots(
        state.serviceId,
        null,
        toLocalDate(new Date(state.slot.startsAt), this.business.timeZone),
      );
      retry.replies.unshift({ body: `Sorry — ${outcome.message}`, blocks: [] });
      return retry;
    }

    const when = formatInZone(
      new Date(state.slot.startsAt),
      this.business.timeZone,
      "EEEE d MMMM 'at' HH:mm",
    );
    const body =
      outcome.status === 'CONFIRMED'
        ? `You’re booked in. I’ve sent a confirmation to ${state.contact.email} with a link to change or cancel.`
        : `Your request is in. ${this.business.name} will confirm it shortly — you’ll get an email at ${state.contact.email} either way.`;
    return this.result(
      [
        {
          body,
          blocks: [
            {
              type: 'booking_result',
              status: outcome.status,
              reference: outcome.reference,
              service: service.name,
              when,
            },
          ],
        },
      ],
      IDLE_STATE,
      true,
    );
  }
  // #endregion learn:confirm-booking

  private startQuote(serviceId: string | null, description: string): FlowResult {
    const service = this.service(serviceId);
    const intro = service
      ? service.kind === 'QUOTE'
        ? `A ${service.name.toLowerCase()} needs a look before it can be priced, so I’ll pass your request to the workshop for a quote.`
        : `I’ll pass this to the workshop so they can give you a price.`
      : `I’ll pass this to the workshop for a quote.`;
    return this.result(
      [
        {
          body: `${intro} Where can they reach you?`,
          blocks: [this.detailsForm('quote', this.ports.knownContact() ?? {})],
        },
      ],
      { step: 'quote.details', serviceId: service?.id ?? null, description: description.slice(0, 1000) },
    );
  }

  private async answer(interpretation: Interpretation): Promise<FlowResult> {
    const { business } = this;
    const service = this.service(interpretation.serviceId);
    const keepState = this.state.step === 'idle' ? IDLE_STATE : this.state;
    const followUps: ReplyBlock = {
      type: 'quick_replies',
      options: [
        service && service.kind === 'BOOKABLE'
          ? quick(`Book ${service.name.toLowerCase()}`, { kind: 'choose_service', serviceId: service.id })
          : quick('Book a time', { kind: 'text', text: 'I’d like to book a time' }),
        quick('Talk to a person', { kind: 'talk_to_human' }),
      ],
    };

    const knowledge = business.knowledge.find((k) => k.id === interpretation.knowledgeItemId);
    if (knowledge) {
      return this.result(
        [
          {
            body: knowledge.answer,
            blocks: [{ type: 'source', label: `From the FAQ: ${knowledge.question}` }, followUps],
          },
        ],
        keepState,
      );
    }

    switch (interpretation.topic) {
      case 'opening_hours':
        return this.result(
          [
            {
              body: `Our opening hours:\n${business.openingHoursLines.join('\n')}`,
              blocks: [{ type: 'source', label: 'From the business settings: opening hours' }, followUps],
            },
          ],
          keepState,
        );
      case 'location':
        if (business.address) {
          return this.result(
            [
              {
                body: `You’ll find us at ${business.address}.`,
                blocks: [{ type: 'source', label: 'From the business settings: address' }, followUps],
              },
            ],
            keepState,
          );
        }
        break;
      case 'contact':
        if (business.contactPhone || business.contactEmail) {
          return this.result(
            [
              {
                body: `You can reach ${business.name} ${[business.contactPhone && `on ${business.contactPhone}`, business.contactEmail && `at ${business.contactEmail}`].filter(Boolean).join(' or ')}.`,
                blocks: [{ type: 'source', label: 'From the business settings: contact details' }, followUps],
              },
            ],
            keepState,
          );
        }
        break;
      case 'prices': {
        if (service) {
          const price = formatPrice(service);
          const body =
            service.kind === 'QUOTE' || !price
              ? `${service.name} is priced after the workshop has had a look. I can pass on a quote request.`
              : `${service.name} costs ${price}${service.durationMinutes ? ` and takes about ${service.durationMinutes} minutes` : ''}.`;
          return this.result(
            [{ body, blocks: [{ type: 'source', label: 'From the price list' }, followUps] }],
            keepState,
          );
        }
        const lines = business.services.map(
          (s) => `${s.name}: ${s.kind === 'QUOTE' ? 'by quote' : (formatPrice(s) ?? 'ask us')}`,
        );
        return this.result(
          [
            {
              body: `Our prices:\n${lines.join('\n')}`,
              blocks: [{ type: 'source', label: 'From the price list' }, followUps],
            },
          ],
          keepState,
        );
      }
      case 'none':
        if (service) {
          const detail = serviceDetail(service);
          return this.result(
            [
              {
                body: `Yes — ${service.name}${service.description ? `: ${service.description}` : '.'}${detail ? ` (${detail})` : ''}`,
                blocks: [{ type: 'source', label: 'From the service list' }, followUps],
              },
            ],
            keepState,
          );
        }
    }

    // Not in the knowledge base: don't guess. A person answers, and the gap becomes visible.
    return this.handOff('unanswered_question');
  }

  // #region learn:handoff-flow
  async handOff(reason: HandoffReason): Promise<FlowResult> {
    await this.ports.handOff(reason);
    const known = this.ports.knownContact();
    const opening =
      reason === 'unanswered_question'
        ? 'I don’t have a reliable answer to that, so I’ve passed your question to the team.'
        : reason === 'customer_asked'
          ? `Of course — I’ve let the team at ${this.business.name} know.`
          : 'I’ve passed this to the team so they can help you directly.';
    const notice: ReplyBlock = { type: 'handoff_notice', replyWithinHours: this.business.handoffReplyHours };

    if (known?.email) {
      return this.result(
        [
          {
            body: `${opening} Someone will reply here, usually within ${this.business.handoffReplyHours} hours.`,
            blocks: [notice],
          },
        ],
        { step: 'handed_off' },
      );
    }
    return this.result(
      [
        {
          body: `${opening} Leave your email so they can reach you even if you close this window.`,
          blocks: [notice, this.detailsForm('handoff', known ?? {})],
        },
      ],
      { step: 'handoff.contact' },
    );
  }
  // #endregion learn:handoff-flow

  clarify(): FlowResult {
    return this.result(
      [{ body: 'Let’s start again — what can I help you with?', blocks: [defaultSuggestions()] }],
      IDLE_STATE,
    );
  }

  private detailsForm(
    purpose: 'booking' | 'quote' | 'handoff',
    prefill: Partial<Record<'name' | 'email' | 'phone', string | undefined>>,
    errors?: Record<string, string>,
  ): ReplyBlock {
    const clean = Object.fromEntries(
      Object.entries(prefill).filter(([, v]) => typeof v === 'string' && v),
    ) as Record<string, string>;
    return { type: 'details_form', purpose, requirePhone: false, prefill: clean, errors };
  }
}
