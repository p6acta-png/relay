import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { env } from '@/lib/env';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';
import { validateSessionToken } from '@/modules/auth/sessions';

/**
 * Session cookie handling (the only place that touches the cookie).
 *
 * - HttpOnly: page JavaScript cannot read it, so an XSS bug cannot steal it.
 * - SameSite=Lax: the browser does not send it on cross-site form posts (CSRF defence).
 * - Secure + __Host- prefix in production: HTTPS only, cannot be set by a subdomain.
 */
export const SESSION_COOKIE = SESSION_COOKIE_NAME;

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Validates the session once per request, however many components ask for it. */
export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});
