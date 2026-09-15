/**
 * Expected failures (validation, permissions, "slot already taken") are thrown as `AppError`
 * with a stable code and a message that is safe to show to users.
 * Anything else is an unexpected bug: it is logged in full and users see a generic message.
 */
export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CHALLENGE_FAILED'
  | 'INVALID_STATE';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CHALLENGE_FAILED: 400,
  INVALID_STATE: 409,
};

/** Converts a Zod error into `{ field: firstMessage }` for form display. */
export function fieldErrorsFrom(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}
