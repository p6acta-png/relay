import { z } from 'zod';
import { isoWeekday, localMinutesOfDay, minutesToTime, toLocalDate, WEEKDAY_SHORT } from '@/lib/time';

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
