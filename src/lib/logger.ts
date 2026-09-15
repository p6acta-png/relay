/**
 * Minimal structured logger. One JSON line per event, so logs can be searched and shipped
 * later without changing call sites. Personal data is redacted before anything is written.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d\s-]{7,}\d/g;
const SENSITIVE_KEYS = /pass(word)?|token|secret|cookie|authorization|email|phone|body|message/i;

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.test(key) && typeof value === 'string') return '[redacted]';
  if (typeof value === 'string') return value.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  if (value instanceof Error) {
    return { name: value.name, message: String(value.message).replace(EMAIL, '[email]'), stack: value.stack };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(k, v)]));
  }
  return value;
}

function write(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...(redactValue('', fields) as object),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.warn(line); // stderr for everything: keeps stdout clean for CLI output
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) =>
    process.env.NODE_ENV === 'development' && write('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};

export const redactForLog = (fields: Record<string, unknown>) => redactValue('', fields);
