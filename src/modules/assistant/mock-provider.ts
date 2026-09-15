import * as chrono from 'chrono-node';
import { addDays, isoWeekday } from '@/lib/time';
import type { Intent, Interpretation, InterpretationRequest, TimePreference } from './interpretation';
import type { AIProvider } from './provider';

/**
 * The built-in demo "AI": deterministic rules, keyword matching and a date parser.
 *
 * It is honest about what it is. It understands a documented set of English phrasings for the
 * things small service businesses are asked every day, and returns "unknown" for everything
 * else — which the conversation flow turns into a clarifying question or a hand-off to a person.
 * Being predictable is what makes it testable and safe to demo.
 */

// ─── Text helpers ───────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s:@.+'/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(
  "a an the i im i'm my me to for of and or is it its do does did you your can could would will be on in at with we our this that have has get got please hi hello hey there what when where how much many are any some want like need just also about from it's id i'd ill i'll".split(
    ' ',
  ),
);

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Loose word match: equal, or sharing a prefix of at least five letters (puncture ~ punctured). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 5 && a.slice(0, n) === b.slice(0, n);
}

function containsPhrase(normalizedText: string, phrase: string): boolean {
  const p = normalize(phrase);
  if (!p) return false;
  return ` ${normalizedText} `.includes(` ${p} `);
}

// ─── Catalogue matching ─────────────────────────────────────────────────────

interface Candidate {
  id: string;
  name: string;
  keywords: string[];
}

interface Match {
  id: string;
  score: number;
  signals: string[];
}

/**
 * Scores catalogue entries against the message. Keyword phrases count most; words from the name
 * count less when many entries share them ("service" appears in several service names).
 */
function bestMatch(message: string, candidates: Candidate[], minimum: number): Match | null {
  const text = normalize(message);
  const words = tokens(message);
  const frequency = new Map<string, number>();
  for (const candidate of candidates) {
    for (const t of new Set(tokens(candidate.name))) frequency.set(t, (frequency.get(t) ?? 0) + 1);
  }

  const scored = candidates
    .map((candidate): Match => {
      let score = 0;
      const signals: string[] = [];
      for (const keyword of candidate.keywords) {
        if (containsPhrase(text, keyword)) {
          score += 3;
          signals.push(`keyword “${keyword}”`);
        }
      }
      for (const t of new Set(tokens(candidate.name))) {
        if (words.some((w) => sameWord(w, t))) {
          score += 1.5 / (frequency.get(t) ?? 1);
          signals.push(`word “${t}”`);
        }
      }
      return { id: candidate.id, score, signals };
    })
    .filter((m) => m.score >= minimum)
    .sort((a, b) => b.score - a.score);

  const [first, second] = scored;
  if (!first) return null;
  // Two equally good matches means we don't really know which one they meant.
  if (second && Math.abs(first.score - second.score) < 0.01) return null;
  return first;
}

// ─── Time preferences ───────────────────────────────────────────────────────

const PART_OF_DAY: [RegExp, TimePreference['partOfDay']][] = [
  [/\b(morning|before lunch|early)\b/, 'morning'],
  [/\b(afternoon|after lunch)\b/, 'afternoon'],
  [/\b(evening|after work|tonight)\b/, 'evening'],
];

function localDateOf(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

// #region learn:parse-time
export function parseTimePreference(
  message: string,
  localNow: { date: string; minute: number },
): TimePreference | null {
  const text = normalize(message);
  const [year, month, day] = localNow.date.split('-').map(Number) as [number, number, number];
  const today = localNow.date;

  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let exactMinute: number | null = null;
  const partOfDay = PART_OF_DAY.find(([pattern]) => pattern.test(text))?.[1] ?? null;

  if (/\bnext week\b/.test(text)) {
    dateFrom = addDays(today, 8 - isoWeekday(today));
    dateTo = addDays(dateFrom, 6);
  } else if (/\bthis week\b/.test(text)) {
    dateFrom = today;
    dateTo = addDays(today, 7 - isoWeekday(today));
  }

  // Norwegian-style dates: 22.09 or 22.09.2026
  const dotted = /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/.exec(text);
  if (!dateFrom && dotted) {
    const y = dotted[3] ? Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]) : year;
    let candidate = localDateOf(y, Number(dotted[2]), Number(dotted[1]));
    if (candidate && !dotted[3] && candidate < today)
      candidate = localDateOf(y + 1, Number(dotted[2]), Number(dotted[1]));
    if (candidate) dateFrom = dateTo = candidate;
  }

  // "the 22nd"
  const ordinal = /\bthe (\d{1,2})(?:st|nd|rd|th)\b/.exec(text);
  if (!dateFrom && ordinal) {
    let candidate = localDateOf(year, month, Number(ordinal[1]));
    if (candidate && candidate < today)
      candidate = localDateOf(month === 12 ? year + 1 : year, (month % 12) + 1, Number(ordinal[1]));
    if (candidate) dateFrom = dateTo = candidate;
  }

  // Everything else: "tomorrow", "next Tuesday", "Friday at 2pm", "22 September"…
  // chrono sees the business's wall-clock time expressed as UTC, so no server time zone leaks in.
  const reference = new Date(
    Date.UTC(year, month - 1, day, Math.floor(localNow.minute / 60), localNow.minute % 60),
  );
  const [parsed] = chrono.en.GB.parse(message, { instant: reference, timezone: 0 }, { forwardDate: true });
  if (parsed) {
    const start = parsed.start;
    if (!dateFrom && (start.isCertain('day') || start.isCertain('weekday'))) {
      dateFrom = dateTo = start.date().toISOString().slice(0, 10);
    }
    if (start.isCertain('hour')) exactMinute = (start.get('hour') ?? 0) * 60 + (start.get('minute') ?? 0);
  }

  // "after 3" → 15:00 (a workshop is not open at 3 in the morning)
  const after = /\bafter (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);
  if (exactMinute === null && after) {
    let hour = Number(after[1]);
    if (after[3] === 'pm' || (!after[3] && hour <= 7)) hour += 12;
    if (hour < 24) exactMinute = hour * 60 + Number(after[2] ?? 0);
  }

  if (!dateFrom && !partOfDay && exactMinute === null) return null;
  if (dateFrom && dateFrom < today) dateFrom = today;
  return { dateFrom, dateTo: dateTo ?? dateFrom, partOfDay, exactMinute };
}
// #endregion learn:parse-time

// ─── Intent rules ───────────────────────────────────────────────────────────

const RULES = {
  human:
    /\b(human|real person|actual person|a person|someone real|speak (to|with)|talk (to|with)|staff member|call me|ring me|phone me|customer service|somebody)\b/,
  cancel: /\b(cancel|cancellation|call off)\b/,
  policy: /\b(policy|policies|rules|terms)\b/,
  quote:
    /\b(quote|quotation|estimate|assessment|what would it cost|how much would it cost|take a look|look at (it|my))\b/,
  book: /\b(book|booking|appointment|reserve|schedule|slot|slots|availability|available|free time|any time|come in|come by|drop (it|my \w+) off|bring (it|my \w+) in|fit me in|time for|get (it|my \w+) (serviced|fixed|repaired|done|looked at|waxed|sharpened))\b/,
  question:
    /(\?\s*$)|^(what|when|where|how|why|which|who|do you|does|can you|could you|are you|is there|is it|will you|have you)\b/,
  greeting: /^(hi|hello|hey|hei|hallo|heisann|good (morning|afternoon|evening)|morning)\b/,
  thanks: /\b(thanks|thank you|takk|cheers|much appreciated)\b/,
  prices: /\b(price|prices|pricing|cost|costs|how much|fee|fees|charge|kroner|nok)\b/,
  openingHours: /\b(open|opening|hours|close|closing|closed)\b/,
  location: /\b(where are you|address|located|location|find you|directions|how do i get)\b/,
  contact: /\b(phone number|email address|contact details|contact you|reach you)\b/,
};

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+47[\s-]?)?(?:\d[\s-]?){8}\b/;

function summaryFor(intent: Intent, parts: string[]): string {
  const label: Record<Intent, string> = {
    greeting: 'Greeting',
    book: 'Booking',
    ask_question: 'Question',
    request_quote: 'Quote request',
    cancel_booking: 'Wants to cancel',
    talk_to_human: 'Wants a person',
    thanks: 'Thanks',
    unknown: 'Not understood',
  };
  return [label[intent], ...parts].join(' · ').slice(0, 200);
}

// #region learn:mock-interpret
export function interpretMessage(request: InterpretationRequest): Interpretation {
  const text = normalize(request.message);
  const words = text.split(' ').filter(Boolean).length;
  const signals: string[] = [];

  const service = bestMatch(request.message, request.services, 1.5);
  const serviceInfo = service ? request.services.find((s) => s.id === service.id)! : null;
  if (service) signals.push(...service.signals.map((s) => `service ${s}`));
  const knowledge = bestMatch(
    request.message,
    request.knowledge.map((k) => ({ id: k.id, name: k.question, keywords: k.keywords })),
    2.5,
  );
  const time = parseTimePreference(request.message, request.localNow);
  if (time) signals.push('time preference');
  const email = EMAIL.exec(request.message)?.[0] ?? null;
  const phone = PHONE.exec(request.message)?.[0]?.trim() ?? null;
  const contact = email || phone ? { email, phone } : null;

  const topic: Interpretation['topic'] = RULES.location.test(text)
    ? 'location'
    : RULES.contact.test(text)
      ? 'contact'
      : RULES.prices.test(text)
        ? 'prices'
        : RULES.openingHours.test(text) && !RULES.book.test(text)
          ? 'opening_hours'
          : 'none';

  const inBookingFlow = request.step.startsWith('booking.');
  let intent: Intent = 'unknown';
  let confidence = 0.2;

  if (RULES.human.test(text)) {
    intent = 'talk_to_human';
    confidence = 0.9;
    signals.push('asks for a person');
  } else if (RULES.cancel.test(text) && !RULES.policy.test(text)) {
    intent = 'cancel_booking';
    confidence = 0.85;
    signals.push('mentions cancelling');
  } else if (RULES.quote.test(text) || (serviceInfo?.kind === 'QUOTE' && !RULES.question.test(text))) {
    intent = 'request_quote';
    confidence = RULES.quote.test(text) ? 0.85 : 0.65;
    signals.push(RULES.quote.test(text) ? 'quote wording' : 'quote-only service');
  } else if (
    RULES.book.test(text) ||
    (time && (serviceInfo?.kind === 'BOOKABLE' || inBookingFlow) && topic === 'none')
  ) {
    intent = 'book';
    confidence = RULES.book.test(text) ? 0.9 : 0.7;
    signals.push(RULES.book.test(text) ? 'booking wording' : 'time given during booking');
  } else if (knowledge || topic !== 'none' || (RULES.question.test(text) && !RULES.greeting.test(text))) {
    intent = 'ask_question';
    confidence = knowledge || topic !== 'none' ? 0.8 : 0.5;
    if (knowledge) signals.push(...knowledge.signals.map((s) => `faq ${s}`));
    if (topic !== 'none') signals.push(`topic ${topic}`);
  } else if (RULES.greeting.test(text) && words <= 5) {
    intent = 'greeting';
    confidence = 0.9;
  } else if (RULES.thanks.test(text) && words <= 8) {
    intent = 'thanks';
    confidence = 0.9;
  } else if (serviceInfo) {
    // Just naming a service ("puncture repair") most likely means they want it.
    intent = serviceInfo.kind === 'QUOTE' ? 'request_quote' : 'book';
    confidence = 0.6;
  } else if (contact && inBookingFlow) {
    intent = 'book';
    confidence = 0.5;
  }

  const parts: string[] = [];
  if (serviceInfo) parts.push(serviceInfo.name);
  if (intent === 'ask_question' && knowledge) {
    parts.push(`FAQ: ${request.knowledge.find((k) => k.id === knowledge.id)!.question}`);
  }
  if (intent === 'ask_question' && topic !== 'none') parts.push(topic.replace('_', ' '));
  if (time?.dateFrom)
    parts.push(time.dateFrom === time.dateTo ? time.dateFrom : `${time.dateFrom}–${time.dateTo}`);
  if (time?.partOfDay) parts.push(time.partOfDay);
  if (time?.exactMinute != null) {
    parts.push(
      `${String(Math.floor(time.exactMinute / 60)).padStart(2, '0')}:${String(time.exactMinute % 60).padStart(2, '0')}`,
    );
  }

  return {
    intent,
    confidence: Math.min(1, confidence + (serviceInfo ? 0.05 : 0)),
    serviceId: serviceInfo?.id ?? null,
    knowledgeItemId: intent === 'ask_question' ? (knowledge?.id ?? null) : null,
    topic: intent === 'ask_question' ? topic : 'none',
    time,
    contact,
    summary: summaryFor(intent, parts),
    signals: signals.slice(0, 12),
  };
}
// #endregion learn:mock-interpret

export const mockAIProvider: AIProvider = {
  name: 'demo-rules',
  isDemo: true,
  async interpret(request) {
    return interpretMessage(request);
  },
};
