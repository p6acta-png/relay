import { addDays, isoWeekday, toLocalDate, zonedTimeToUtc, type LocalDate } from '@/lib/time';

/**
 * The slot finder: "when could this service be booked, and with whom?"
 *
 * It is a pure function — no database, no clock, no time zone of the server — so every rule
 * can be tested with plain inputs, including the October clock change in Oslo.
 * Callers load the data (src/modules/scheduling/availability.ts) and pass it in.
 */
export interface WeeklyHours {
  /** ISO weekday, 1 = Monday. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface StaffAvailabilityInput {
  id: string;
  sortOrder: number;
  hours: WeeklyHours[];
}

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export interface SlotFinderInput {
  timeZone: string;
  now: Date;
  durationMinutes: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  /** Inclusive local date range to search. */
  from: LocalDate;
  to: LocalDate;
  /** Optional local time-of-day window the slot must start in, e.g. afternoon = 12:00–17:00. */
  window?: { startMinute: number; endMinute: number };
  staff: StaffAvailabilityInput[];
  /** staffMemberId = null means the whole business is closed. */
  timeOff: (Interval & { staffMemberId: string | null })[];
  /** Existing PENDING or CONFIRMED bookings. */
  busy: (Interval & { staffMemberId: string })[];
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  staffMemberId: string;
  /** Every staff member free at this time, best choice first. */
  alternatives: string[];
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Guards against accidental huge searches (e.g. a year of 5-minute slots). */
const MAX_DAYS = 62;

const overlaps = (a: Interval, b: Interval) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

// #region learn:find-slots
export function findAvailableSlots(input: SlotFinderInput): Slot[] {
  const earliestStart = new Date(input.now.getTime() + input.minNoticeMinutes * MINUTE);
  const latestStart = new Date(input.now.getTime() + input.horizonDays * DAY);
  const today = toLocalDate(input.now, input.timeZone);

  const from = input.from < today ? today : input.from;
  const lastAllowed = toLocalDate(latestStart, input.timeZone);
  const to = input.to > lastAllowed ? lastAllowed : input.to;

  // Candidate (time, staff) pairs, grouped by start time.
  const byStart = new Map<number, { startsAt: Date; endsAt: Date; staffIds: string[] }>();
  let days = 0;

  for (let date = from; date <= to && days < MAX_DAYS; date = addDays(date, 1), days++) {
    const weekday = isoWeekday(date);
    for (const member of input.staff) {
      for (const range of member.hours.filter((h) => h.weekday === weekday)) {
        for (
          let minute = range.startMinute;
          minute + input.durationMinutes <= range.endMinute;
          minute += input.slotIntervalMinutes
        ) {
          if (input.window && (minute < input.window.startMinute || minute >= input.window.endMinute))
            continue;

          const startsAt = zonedTimeToUtc(date, minute, input.timeZone);
          const slot = { startsAt, endsAt: new Date(startsAt.getTime() + input.durationMinutes * MINUTE) };

          if (startsAt < earliestStart || startsAt > latestStart) continue;
          const closed = input.timeOff.some(
            (off) => (off.staffMemberId === null || off.staffMemberId === member.id) && overlaps(off, slot),
          );
          if (closed) continue;
          const booked = input.busy.some((b) => b.staffMemberId === member.id && overlaps(b, slot));
          if (booked) continue;

          const key = startsAt.getTime();
          const entry = byStart.get(key) ?? { ...slot, staffIds: [] };
          if (!entry.staffIds.includes(member.id)) entry.staffIds.push(member.id);
          byStart.set(key, entry);
        }
      }
    }
  }

  // When several people are free, spread the work: fewest bookings that day first.
  const load = new Map<string, number>();
  const loadKey = (staffId: string, date: LocalDate) => `${staffId}|${date}`;
  for (const b of input.busy) {
    const key = loadKey(b.staffMemberId, toLocalDate(b.startsAt, input.timeZone));
    load.set(key, (load.get(key) ?? 0) + 1);
  }
  const order = new Map(input.staff.map((s) => [s.id, s.sortOrder]));

  return [...byStart.values()]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((entry) => {
      const date = toLocalDate(entry.startsAt, input.timeZone);
      const ranked = [...entry.staffIds].sort(
        (a, b) =>
          (load.get(loadKey(a, date)) ?? 0) - (load.get(loadKey(b, date)) ?? 0) ||
          (order.get(a) ?? 0) - (order.get(b) ?? 0) ||
          a.localeCompare(b),
      );
      return {
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        staffMemberId: ranked[0]!,
        alternatives: ranked,
      };
    });
}
// #endregion learn:find-slots

/**
 * Picks a short, varied list to show a customer: at most `perDay` per day, spread across
 * morning and afternoon, up to `max` in total.
 */
export function pickSlotsToOffer(slots: Slot[], timeZone: string, max = 6, perDay = 3): Slot[] {
  const days = new Map<LocalDate, Slot[]>();
  for (const slot of slots) {
    const date = toLocalDate(slot.startsAt, timeZone);
    days.set(date, [...(days.get(date) ?? []), slot]);
  }
  const offered: Slot[] = [];
  for (const daySlots of days.values()) {
    if (offered.length >= max) break;
    const take = Math.min(perDay, max - offered.length);
    if (daySlots.length <= take) {
      offered.push(...daySlots);
      continue;
    }
    // Evenly spaced picks through the day instead of the first three in a row.
    for (let i = 0; i < take; i++) {
      offered.push(daySlots[Math.round((i * (daySlots.length - 1)) / Math.max(1, take - 1))]!);
    }
  }
  return offered.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
