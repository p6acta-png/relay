'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { cx } from '@/lib/cx';
import { findSlotsAction, type SlotChoice } from '../actions';

/**
 * Pick a day, then one of the free times the server calculated. The chosen time and person are
 * sent as hidden fields; the server checks availability again when the form is submitted.
 */
export function SlotPicker({
  serviceId,
  initialDate,
  minDate,
  excludeBookingId,
}: {
  serviceId: string;
  initialDate: string;
  minDate: string;
  excludeBookingId?: string;
}) {
  const id = useId();
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<SlotChoice[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<SlotChoice | null>(null);
  const [staffId, setStaffId] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!serviceId || !date) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await findSlotsAction({ serviceId, date, excludeBookingId });
      if (cancelled) return;
      setChosen(null);
      setStaffId('');
      if (result.ok) {
        setSlots(result.slots);
        setMessage(result.slots.length ? null : 'No free times on this day. Try another date.');
      } else {
        setSlots([]);
        setMessage(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId, date, excludeBookingId]);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Time</legend>
      <div>
        <label htmlFor={`${id}-date`} className="mb-1.5 block text-[0.8125rem] text-ink-2">
          Day
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          min={minDate}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 rounded-[var(--radius-md)] border border-rule-strong bg-white px-3 text-sm"
        />
      </div>

      <div aria-live="polite" className="min-h-10">
        {!serviceId ? (
          <p className="text-sm text-ink-3">Choose a service first.</p>
        ) : pending ? (
          <p className="text-sm text-ink-3">Finding free times…</p>
        ) : message ? (
          <p className="text-sm text-ink-3">{message}</p>
        ) : (
          <div role="radiogroup" aria-label="Free times" className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {slots?.map((slot) => (
              <button
                key={slot.startsAt}
                type="button"
                role="radio"
                aria-checked={chosen?.startsAt === slot.startsAt}
                onClick={() => {
                  setChosen(slot);
                  setStaffId('');
                }}
                className={cx(
                  'tabular h-9 rounded-[var(--radius-md)] border font-mono text-[0.8125rem] transition-colors',
                  chosen?.startsAt === slot.startsAt
                    ? 'border-pine-700 bg-pine-700 text-white'
                    : 'border-rule-strong bg-white hover:border-pine-600 hover:bg-pine-50',
                )}
              >
                {slot.time}
              </button>
            ))}
          </div>
        )}
      </div>

      {chosen && (
        <div>
          <label htmlFor={`${id}-staff`} className="mb-1.5 block text-[0.8125rem] text-ink-2">
            With
          </label>
          <select
            id={`${id}-staff`}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="h-10 w-full max-w-xs rounded-[var(--radius-md)] border border-rule-strong bg-white px-2 text-sm"
          >
            <option value="">First available ({chosen.staff[0]?.name})</option>
            {chosen.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <input type="hidden" name="startsAt" value={chosen?.startsAt ?? ''} />
      <input type="hidden" name="staffMemberId" value={staffId} />
    </fieldset>
  );
}
