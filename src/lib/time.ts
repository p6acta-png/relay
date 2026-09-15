import { TZDate, tz } from '@date-fns/tz';
import { format } from 'date-fns';

/**
 * Time zone helpers.
 *
 * Rule: store instants in UTC, reason about business rules in the business's local time.
 * "Open 08:00–16:00" means Oslo wall-clock time — 06:00 UTC in summer, 07:00 UTC in winter —
 * so every conversion goes through the IANA time zone database, never a fixed offset.
 *
 * A "local date" is a plain 'YYYY-MM-DD' string with no time zone attached.
 */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: LocalDate): [number, number, number] {
  const match = LOCAL_DATE.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The UTC instant for a wall-clock time (minutes after midnight) on a local date in `timeZone`. */
export function zonedTimeToUtc(date: LocalDate, minutesAfterMidnight: number, timeZone: string): Date {
  const [year, month, day] = parts(date);
  const hours = Math.floor(minutesAfterMidnight / 60);
  const minutes = minutesAfterMidnight % 60;
  return new Date(new TZDate(year, month - 1, day, hours, minutes, timeZone).getTime());
}

export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  return format(instant, 'yyyy-MM-dd', { in: tz(timeZone) });
}

export function localMinutesOfDay(instant: Date, timeZone: string): number {
  const zoned = new TZDate(instant.getTime(), timeZone);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  const [year, month, day] = parts(date);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function formatInZone(instant: Date, timeZone: string, pattern: string): string {
  return format(instant, pattern, { in: tz(timeZone) });
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Invalid time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "Tue 22 Sep, 14:00" in the business's time zone. */
export function formatSlot(instant: Date, timeZone: string): string {
  return formatInZone(instant, timeZone, 'EEE d MMM, HH:mm');
}
