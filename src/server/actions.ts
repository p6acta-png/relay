import 'server-only';
import { randomUUID } from 'node:crypto';
import { unstable_rethrow } from 'next/navigation';
import type { ActionResult } from '@/lib/action-result';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export type { ActionResult } from '@/lib/action-result';

/**
 * Wraps a server action body: expected `AppError`s become a friendly result, anything else is
 * logged with a short reference the user can quote, and Next.js redirects pass through.
 */
// #region learn:run-action
export async function runAction<T>(
  name: string,
  work: () => Promise<ActionResult<T>>,
  options: { form?: FormData; omit?: string[] } = {},
): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (error) {
    // redirect() and notFound() work by throwing; hand those back to Next.js.
    unstable_rethrow(error);
    const values = options.form ? echoValues(options.form, options.omit) : undefined;
    if (isAppError(error))
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors, values };
    const reference = randomUUID().slice(0, 8);
    logger.error('action.failed', { action: name, reference, error });
    return {
      ok: false,
      message: `Something went wrong on our side (ref ${reference}). Please try again.`,
      values,
    };
  }
}
// #endregion learn:run-action

/** Reads a FormData value as a string ('' when missing or a file). */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

const NEVER_ECHO = /password|token|website/i;

/** Text fields to send back after a failed submission (never passwords or security tokens). */
function echoValues(form: FormData, omit: string[] = []): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string' || key.startsWith('$') || NEVER_ECHO.test(key) || omit.includes(key))
      continue;
    values[key] = value.slice(0, 2000);
  }
  return values;
}
