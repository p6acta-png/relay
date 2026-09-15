/**
 * Cheap, explainable abuse signals for public chat messages.
 *
 * Nothing here blocks a message outright — it is stored and shown to staff as normal (and always
 * rendered as plain text). A flagged conversation simply stops being handled automatically:
 * Relay will not create bookings or leads from it and hands it to a person instead.
 */
export type SpamReason = 'links' | 'spam_terms' | 'repeated' | 'gibberish' | 'markup';

export interface SpamVerdict {
  flagged: boolean;
  reasons: SpamReason[];
}

const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
const SPAM_TERMS =
  /\b(casino|crypto ?currency|bitcoin|forex|viagra|cialis|seo services|backlinks?|guest post|loan offer|investment opportunity|onlyfans)\b/i;
const MARKUP = /<\s*(script|iframe|img|svg|object)\b|javascript:|on\w+\s*=/i;

// #region learn:spam
export function assessMessage(text: string, recentCustomerMessages: string[] = []): SpamVerdict {
  const reasons: SpamReason[] = [];
  const links = text.match(LINK)?.length ?? 0;
  if (links >= 3) reasons.push('links');
  if (SPAM_TERMS.test(text)) reasons.push('spam_terms');
  if (MARKUP.test(text)) reasons.push('markup');

  const normalized = text.trim().toLowerCase();
  const repeats = recentCustomerMessages.filter((m) => m.trim().toLowerCase() === normalized).length;
  if (normalized.length > 0 && repeats >= 2) reasons.push('repeated');

  // Long text with almost no vowels or one character repeated is rarely a real question.
  const letters = normalized.replace(/[^a-zæøå]/g, '');
  const vowels = letters.replace(/[^aeiouyæøå]/g, '').length;
  if (letters.length >= 25 && (vowels / letters.length < 0.12 || /(.)\1{9,}/.test(normalized))) {
    reasons.push('gibberish');
  }
  return { flagged: reasons.length > 0, reasons };
}
// #endregion learn:spam
