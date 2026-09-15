import 'server-only';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { AppError, HTTP_STATUS, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Helpers for public JSON route handlers.
 * Errors always come back in one shape — `{ error: { code, message, fieldErrors? } }` —
 * and unexpected errors never include internal details.
 */
export function jsonError(error: unknown, route: string): Response {
  if (isAppError(error)) {
    return Response.json(
      { error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } },
      { status: HTTP_STATUS[error.code], headers: noStore },
    );
  }
  const reference = randomUUID().slice(0, 8);
  logger.error('api.failed', { route, reference, error });
  return Response.json(
    { error: { code: 'INTERNAL', message: `Something went wrong on our side (ref ${reference}).` } },
    { status: 500, headers: noStore },
  );
}

export const noStore = { 'Cache-Control': 'no-store' };

export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Only accept state-changing requests that come from our own pages.
 * Browsers always send Origin on cross-site POSTs, so a mismatch means another site is trying.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return; // Non-browser clients (tests, curl) don't send Origin; the token still protects them.
  const allowed = new Set([new URL(env.APP_URL).origin, new URL(request.url).origin]);
  if (!allowed.has(origin)) throw new AppError('FORBIDDEN', 'Requests from other sites are not allowed.');
}

export async function readJson(request: Request, maxBytes = 16_000): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new AppError('VALIDATION', 'Expected a JSON body.');
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new AppError('VALIDATION', 'Request body is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION', 'Request body is not valid JSON.');
  }
}
