import 'server-only';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { hmacIdentifier } from '@/lib/tokens';

/**
 * Fixed-window rate limiting stored in PostgreSQL.
 *
 * Why the database and not memory: an in-memory counter resets on every restart and is not
 * shared between server instances, so it stops working the moment the app is deployed with
 * more than one process. One atomic UPSERT per request is cheap at this scale.
 */
export interface RateLimitRule {
  /** Short name used in the key, e.g. "login-ip". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const RATE_LIMITS = {
  loginByIp: { name: 'login-ip', limit: 30, windowSeconds: 15 * 60 },
  loginByEmail: { name: 'login-email', limit: 10, windowSeconds: 15 * 60 },
  signupByIp: { name: 'signup-ip', limit: 10, windowSeconds: 60 * 60 },
  conversationStartByIp: { name: 'chat-start-ip', limit: 20, windowSeconds: 60 * 60 },
  chatMessageByIp: { name: 'chat-msg-ip', limit: 60, windowSeconds: 5 * 60 },
  chatMessageByConversation: { name: 'chat-msg-convo', limit: 25, windowSeconds: 5 * 60 },
  manageBookingByIp: { name: 'manage-booking-ip', limit: 30, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Hash identifiers (IP addresses, emails) so rate-limit rows never contain personal data. */
export function rateLimitSubject(value: string): string {
  return hmacIdentifier(value.toLowerCase(), env.APP_SECRET);
}

// #region learn:rate-limit
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);
  const key = `${rule.name}:${subject}`;

  // Atomic: concurrent requests cannot both read "4" and both write "5".
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);

  // Opportunistic cleanup instead of a scheduled job: about 1 in 50 requests prunes old windows.
  if (Math.random() < 0.02) {
    await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
  };
}
// #endregion learn:rate-limit

/** Throws a user-safe RATE_LIMITED error when the limit is exceeded. */
export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const result = await consumeRateLimit(rule, subject);
  if (!result.allowed) {
    const minutes = Math.ceil(result.retryAfterSeconds / 60);
    throw new AppError(
      'RATE_LIMITED',
      `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
}
