/**
 * The shape every server action returns to a form. Shared by server and client code.
 * Expected failures carry a safe message and per-field errors; unexpected failures are logged
 * on the server and shown generically, so stack traces never reach the browser.
 */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

export const IDLE_RESULT: ActionResult = { ok: true };

export function fieldError(state: ActionResult<unknown>, name: string): string | undefined {
  return state.ok ? undefined : state.fieldErrors?.[name];
}

/** The value a field had when the failed submission was sent, so the form does not lose input. */
export function previousValue(state: ActionResult<unknown>, name: string): string | undefined {
  return state.ok ? undefined : state.values?.[name];
}
