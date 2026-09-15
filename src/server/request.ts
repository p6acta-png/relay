import 'server-only';
import { headers } from 'next/headers';

/**
 * Best-effort client IP for rate limiting.
 *
 * Next.js fills `x-forwarded-for` from the socket only when the header is absent, so a client
 * talking to the app directly could send a fake value. In production the app must run behind a
 * reverse proxy that overwrites this header (every common host does). That is why IP limits are
 * only a first, coarse layer: the limits that matter are keyed on things a client cannot rotate
 * for free — the email being logged into and the conversation being written to.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip') || 'unknown';
}

export async function requestOrigin(): Promise<string | null> {
  return (await headers()).get('origin');
}
