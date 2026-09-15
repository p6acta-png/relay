import { describe, expect, it } from 'vitest';
import { findAvailableSlots, pickSlotsToOffer, type SlotFinderInput } from './slots';

const TZ = 'Europe/Oslo';
const weekdays = (startMinute: number, endMinute: number) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute, endMinute }));

/** Monday 19 October 2026, 09:00 in Oslo (summer time, UTC+2). */
const MONDAY_0900 = new Date('2026-10-19T07:00:00Z');

function input(overrides: Partial<SlotFinderInput> = {}): SlotFinderInput {
  return {
    timeZone: TZ,
    now: MONDAY_0900,
    durationMinutes: 60,
    slotIntervalMinutes: 30,
    minNoticeMinutes: 0,
    horizonDays: 30,
    from: '2026-10-20',
    to: '2026-10-20',
    staff: [{ id: 'ingrid', sortOrder: 0, hours: weekdays(8 * 60, 16 * 60) }],
    timeOff: [],
    busy: [],
    ...overrides,
  };
}

const times = (slots: { startsAt: Date }[]) =>
  slots.map((s) =>
    s.startsAt.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
  );

describe('findAvailableSlots', () => {
  it('offers every 30 minutes within working hours, finishing by closing time', () => {
    const slots = findAvailableSlots(input());
    expect(times(slots)).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
    ]);
    expect(slots.at(-1)!.endsAt.toISOString()).toBe('2026-10-20T14:00:00.000Z'); // 16:00 local
  });

  it('respects minimum notice', () => {
    const slots = findAvailableSlots(input({ from: '2026-10-19', to: '2026-10-19', minNoticeMinutes: 120 }));
    expect(times(slots)[0]).toBe('11:00');
  });

  it('does not offer anything beyond the booking horizon', () => {
    expect(findAvailableSlots(input({ from: '2026-10-22', to: '2026-10-22', horizonDays: 2 }))).toEqual([]);
  });

  it('never offers the past, even if asked', () => {
    const slots = findAvailableSlots(input({ from: '2026-10-12', to: '2026-10-19' }));
    expect(slots.every((s) => s.startsAt >= MONDAY_0900)).toBe(true);
  });

  it('blocks times overlapping an existing booking for that person only', () => {
    const busy = [
      {
        staffMemberId: 'ingrid',
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T09:00:00Z'),
      },
    ]; // 10:00–11:00 local
    const slots = findAvailableSlots(
      input({
        busy,
        staff: [
          { id: 'ingrid', sortOrder: 0, hours: weekdays(8 * 60, 16 * 60) },
          { id: 'jonas', sortOrder: 1, hours: weekdays(10 * 60, 12 * 60) },
        ],
      }),
    );
    const at = (hhmm: string) => slots.find((s) => times([s])[0] === hhmm);
    expect(at('09:00')!.alternatives).toEqual(['ingrid']); // 09:00–10:00 ends exactly as the booking starts
    expect(at('09:30')).toBeUndefined(); // Ingrid is busy, Jonas starts at 10:00
    expect(at('10:00')!.alternatives).toEqual(['jonas']);
    expect(at('11:00')!.alternatives).toEqual(['jonas', 'ingrid']); // Jonas has no bookings that day
  });

  it('closes the whole business for business-wide time off', () => {
    const timeOff = [
      {
        staffMemberId: null,
        startsAt: new Date('2026-10-20T00:00:00Z'),
        endsAt: new Date('2026-10-21T00:00:00Z'),
      },
    ];
    expect(findAvailableSlots(input({ timeOff }))).toEqual([]);
  });

  it('applies personal time off to one staff member', () => {
    const timeOff = [
      {
        staffMemberId: 'ingrid',
        startsAt: new Date('2026-10-20T10:00:00Z'),
        endsAt: new Date('2026-10-20T14:00:00Z'),
      },
    ];
    expect(times(findAvailableSlots(input({ timeOff }))).at(-1)).toBe('11:00');
  });

  it('filters by a time-of-day window such as “afternoon”', () => {
    const slots = findAvailableSlots(input({ window: { startMinute: 12 * 60, endMinute: 17 * 60 } }));
    expect(times(slots)[0]).toBe('12:00');
    expect(times(slots).at(-1)).toBe('15:00');
  });

  it('handles the switch to winter time in Oslo (25 October 2026)', () => {
    const friday = findAvailableSlots(input({ from: '2026-10-23', to: '2026-10-23' }))[2]!;
    const monday = findAvailableSlots(input({ from: '2026-10-26', to: '2026-10-26' }))[2]!;
    // 09:00 local both days, but UTC+2 before the change and UTC+1 after it.
    expect(friday.startsAt.toISOString()).toBe('2026-10-23T07:00:00.000Z');
    expect(monday.startsAt.toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('skips days without working hours (the weekend)', () => {
    const slots = findAvailableSlots(input({ from: '2026-10-24', to: '2026-10-25' }));
    expect(slots).toEqual([]);
  });

  it('prefers the least busy person, then the configured order', () => {
    const staff = [
      { id: 'ingrid', sortOrder: 0, hours: weekdays(8 * 60, 16 * 60) },
      { id: 'jonas', sortOrder: 1, hours: weekdays(8 * 60, 16 * 60) },
    ];
    const quiet = findAvailableSlots(input({ staff }))[0]!;
    expect(quiet.staffMemberId).toBe('ingrid');

    const busy = [
      {
        staffMemberId: 'ingrid',
        startsAt: new Date('2026-10-20T12:00:00Z'),
        endsAt: new Date('2026-10-20T13:00:00Z'),
      },
    ];
    const balanced = findAvailableSlots(input({ staff, busy }))[0]!;
    expect(balanced.staffMemberId).toBe('jonas');
  });
});

describe('pickSlotsToOffer', () => {
  it('spreads a few choices across the day and across days', () => {
    const slots = findAvailableSlots(input({ from: '2026-10-20', to: '2026-10-22' }));
    const offered = pickSlotsToOffer(slots, TZ, 6, 3);
    expect(offered).toHaveLength(6);
    expect(times(offered.slice(0, 3))).toEqual(['08:00', '11:30', '15:00']);
  });
});
