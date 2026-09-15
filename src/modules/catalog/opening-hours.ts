import { z } from 'zod';
import {
  isoWeekday,
  localMinutesOfDay,
  minutesToTime,
  toLocalDate,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
} from '@/lib/time';

/** Weekly opening hours stored as JSON on Organization. Validated on every read and write. */
export const openingHoursSchema = z
  .array(
    z
      .object({
        weekday: z.int().min(1).max(7),
        opens: z.int().min(0).max(1439),
        closes: z.int().min(1).max(1440),
      })
      .refine((range) => range.closes > range.opens, 'Closing time must be after opening time'),
  )
  .max(14);

export type OpeningHours = z.infer<typeof openingHoursSchema>;

export function parseOpeningHours(value: unknown): OpeningHours {
  const result = openingHoursSchema.safeParse(value);
  return result.success ? result.data : [];
}

export function isOpenAt(hours: OpeningHours, instant: Date, timeZone: string): boolean {
  const weekday = isoWeekday(toLocalDate(instant, timeZone));
  const minute = localMinutesOfDay(instant, timeZone);
  return hours.some((range) => range.weekday === weekday && minute >= range.opens && minute < range.closes);
}

/**
 * "Open now · closes 17:00" or "Closed · opens tomorrow at 09:00".
 * Looks up to a week ahead in the business's own time zone.
 */
export function describeOpenStatus(hours: OpeningHours, instant: Date, timeZone: string) {
  const today = toLocalDate(instant, timeZone);
  const minute = localMinutesOfDay(instant, timeZone);
  const weekday = isoWeekday(today);
  const current = hours.find((r) => r.weekday === weekday && minute >= r.opens && minute < r.closes);
  if (current) return { open: true, label: `Open now · closes ${minutesToTime(current.closes)}` };

  for (let ahead = 0; ahead < 7; ahead++) {
    const day = ((weekday - 1 + ahead) % 7) + 1;
    const next = hours
      .filter((r) => r.weekday === day && (ahead > 0 || r.opens > minute))
      .sort((a, b) => a.opens - b.opens)[0];
    if (next) {
      const when = ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : WEEKDAY_NAMES[day - 1];
      return { open: false, label: `Closed · opens ${when} at ${minutesToTime(next.opens)}` };
    }
  }
  return { open: false, label: 'Closed' };
}

/** Groups consecutive days with identical hours: ["Mon–Fri 08:00–17:00", "Sat 10:00–14:00", "Sun closed"]. */
export function describeOpeningHours(hours: OpeningHours): string[] {
  const byDay = Array.from(
    { length: 7 },
    (_, i) =>
      hours
        .filter((h) => h.weekday === i + 1)
        .sort((a, b) => a.opens - b.opens)
        .map((h) => `${minutesToTime(h.opens)}–${minutesToTime(h.closes)}`)
        .join(', ') || 'closed',
  );
  const lines: string[] = [];
  let start = 0;
  for (let day = 1; day <= 7; day++) {
    if (day === 7 || byDay[day] !== byDay[start]) {
      const label =
        start === day - 1 ? WEEKDAY_SHORT[start] : `${WEEKDAY_SHORT[start]}–${WEEKDAY_SHORT[day - 1]}`;
      lines.push(`${label} ${byDay[start]}`);
      start = day;
    }
  }
  return lines;
}
