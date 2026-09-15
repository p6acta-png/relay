import { describe, expect, it } from 'vitest';
import type { InterpretationRequest } from './interpretation';
import { interpretMessage, parseTimePreference } from './mock-provider';
import { understand, type AIProvider } from './provider';

const ID = {
  puncture: '0192f0a0-0000-7000-8000-000000000001',
  standard: '0192f0a0-0000-7000-8000-000000000002',
  ebike: '0192f0a0-0000-7000-8000-000000000003',
  ski: '0192f0a0-0000-7000-8000-000000000004',
  overhaul: '0192f0a0-0000-7000-8000-000000000005',
  warranty: '0192f0a0-0000-7000-8000-00000000000a',
  payment: '0192f0a0-0000-7000-8000-00000000000b',
};

/** Monday 14 September 2026, 10:00 in the business's time zone. */
const request = (message: string, step = 'idle'): InterpretationRequest => ({
  message,
  step,
  localNow: { date: '2026-09-14', minute: 600 },
  services: [
    {
      id: ID.puncture,
      name: 'Puncture repair',
      kind: 'BOOKABLE',
      keywords: ['puncture', 'flat tyre', 'flat tire', 'inner tube'],
    },
    {
      id: ID.standard,
      name: 'Standard bike service',
      kind: 'BOOKABLE',
      keywords: ['service', 'servicing', 'tune-up', 'check-up'],
    },
    {
      id: ID.ebike,
      name: 'E-bike diagnostics',
      kind: 'BOOKABLE',
      keywords: ['e-bike', 'ebike', 'electric bike', 'motor', 'battery'],
    },
    {
      id: ID.ski,
      name: 'Ski waxing and edges',
      kind: 'BOOKABLE',
      keywords: ['ski', 'skis', 'wax', 'waxing', 'edges'],
    },
    {
      id: ID.overhaul,
      name: 'Full overhaul',
      kind: 'QUOTE',
      keywords: ['overhaul', 'rebuild', 'restoration'],
    },
  ],
  knowledge: [
    { id: ID.warranty, question: 'Do you give a warranty on repairs?', keywords: ['warranty', 'guarantee'] },
    { id: ID.payment, question: 'How can I pay?', keywords: ['pay', 'payment', 'vipps', 'card'] },
  ],
});

describe('demo AI: intents', () => {
  const cases: [
    string,
    string,
    Partial<{ serviceId: string | null; knowledgeItemId: string | null; topic: string }>,
  ][] = [
    ['Hi!', 'greeting', {}],
    ["Hi, I'd like to book a service next Tuesday afternoon", 'book', { serviceId: ID.standard }],
    ['Can I get my bike serviced on Friday?', 'book', { serviceId: ID.standard }],
    ['I have a flat tyre, do you have time tomorrow?', 'book', { serviceId: ID.puncture }],
    ['My skis need waxing', 'book', { serviceId: ID.ski }],
    ['How much is a puncture repair?', 'ask_question', { serviceId: ID.puncture, topic: 'prices' }],
    ['When are you open on Saturday?', 'ask_question', { topic: 'opening_hours' }],
    ['Where are you located?', 'ask_question', { topic: 'location' }],
    ['Do you give any guarantee on the work?', 'ask_question', { knowledgeItemId: ID.warranty }],
    ['Can I pay with Vipps?', 'ask_question', { knowledgeItemId: ID.payment }],
    ['Do you offer a student discount?', 'ask_question', { knowledgeItemId: null, topic: 'none' }],
    [
      'Could you give me a quote for a full overhaul of my old Peugeot?',
      'request_quote',
      { serviceId: ID.overhaul },
    ],
    ['My frame needs a complete rebuild', 'request_quote', { serviceId: ID.overhaul }],
    ['I need to cancel my appointment', 'cancel_booking', {}],
    ['What is your cancellation policy?', 'ask_question', {}],
    ['Can I talk to a real person please', 'talk_to_human', {}],
    ['Thanks, that’s great', 'thanks', {}],
    ['asdkjh qwe zzz', 'unknown', {}],
  ];

  it.each(cases)('“%s” → %s', (message, intent, expected) => {
    const result = interpretMessage(request(message));
    expect(result.intent).toBe(intent);
    expect(result).toMatchObject(expected);
  });

  it('reads a bare time as an answer while a booking is in progress', () => {
    expect(interpretMessage(request('Thursday morning', 'booking.time')).intent).toBe('book');
    expect(interpretMessage(request('Thursday morning', 'idle')).intent).toBe('unknown');
  });

  it('explains itself with a summary and signals', () => {
    const result = interpretMessage(request('Book a service next Tuesday afternoon'));
    expect(result.summary).toBe('Booking · Standard bike service · 2026-09-22 · afternoon');
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('picks up an email address or phone number written in the message', () => {
    expect(interpretMessage(request('it is kari@example.com, 912 34 567')).contact).toEqual({
      email: 'kari@example.com',
      phone: '912 34 567',
    });
  });
});

describe('demo AI: time preferences', () => {
  const now = { date: '2026-09-14', minute: 600 }; // Monday 10:00

  it.each([
    [
      'next Tuesday afternoon',
      { dateFrom: '2026-09-22', dateTo: '2026-09-22', partOfDay: 'afternoon', exactMinute: null },
    ],
    ['tomorrow morning', { dateFrom: '2026-09-15', partOfDay: 'morning' }],
    ['this Thursday at 14:00', { dateFrom: '2026-09-17', exactMinute: 840 }],
    ['Friday 2pm', { dateFrom: '2026-09-18', exactMinute: 840 }],
    ['sometime next week', { dateFrom: '2026-09-21', dateTo: '2026-09-27' }],
    ['can I come on 22.09?', { dateFrom: '2026-09-22', dateTo: '2026-09-22' }],
    ['what about the 3rd', { dateFrom: '2026-10-03' }],
    ['today after 3', { dateFrom: '2026-09-14', exactMinute: 900 }],
    ['in the afternoon', { dateFrom: null, partOfDay: 'afternoon' }],
  ])('“%s”', (text, expected) => {
    expect(parseTimePreference(text, now)).toMatchObject(expected);
  });

  it('returns null when no time is mentioned', () => {
    expect(parseTimePreference('I have a flat tyre', now)).toBeNull();
  });
});

describe('validating provider output before use', () => {
  const provider = (output: unknown): AIProvider => ({
    name: 'test',
    isDemo: true,
    interpret: async () => output,
  });

  it('accepts well-formed output that references this business’s catalogue', async () => {
    const good = interpretMessage(request('How much is a puncture repair?'));
    const result = await understand(request('x'), provider(good));
    expect(result.rejected).toBeUndefined();
    expect(result.interpretation.serviceId).toBe(ID.puncture);
  });

  it('rejects output with the wrong shape', async () => {
    const result = await understand(request('x'), provider({ intent: 'book', confidence: 7 }));
    expect(result).toMatchObject({ rejected: 'invalid_shape', interpretation: { intent: 'unknown' } });
  });

  it('rejects output that points at a service this business does not have', async () => {
    const forged = {
      ...interpretMessage(request('book a service')),
      serviceId: '0192f0a0-0000-7000-8000-0000000000ff',
    };
    const result = await understand(request('x'), provider(forged));
    expect(result).toMatchObject({ rejected: 'unknown_reference', interpretation: { intent: 'unknown' } });
  });

  it('falls back safely when the provider throws', async () => {
    const failing: AIProvider = {
      name: 'down',
      isDemo: false,
      interpret: async () => {
        throw new Error('503');
      },
    };
    const result = await understand(request('x'), failing);
    expect(result).toMatchObject({ rejected: 'provider_error', interpretation: { intent: 'unknown' } });
  });
});
