'use client';

import { minutesToTime, timeToMinutes, WEEKDAY_NAMES } from '@/lib/time';

export interface DayRange {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/**
 * One row per weekday: open or closed, and from–to times. The data model allows several ranges
 * per day; this editor keeps one, which covers almost every small business.
 */
export function WeekHoursEditor({
  value,
  onChange,
  disabled,
  label,
}: {
  value: DayRange[];
  onChange: (next: DayRange[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const byDay = (weekday: number) => value.find((r) => r.weekday === weekday);
  const set = (weekday: number, range: DayRange | null) => {
    const rest = value.filter((r) => r.weekday !== weekday);
    onChange(range ? [...rest, range].sort((a, b) => a.weekday - b.weekday) : rest);
  };

  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="divide-y divide-rule rounded-[var(--radius-md)] border border-rule bg-white">
        {WEEKDAY_NAMES.map((name, index) => {
          const weekday = index + 1;
          const range = byDay(weekday);
          return (
            <div key={name} className="grid grid-cols-[7rem_auto_1fr] items-center gap-3 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-pine-700"
                  checked={Boolean(range)}
                  onChange={(e) =>
                    set(weekday, e.target.checked ? { weekday, startMinute: 540, endMinute: 1020 } : null)
                  }
                />
                {name}
              </label>
              {range ? (
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    step={900}
                    aria-label={`${name} from`}
                    value={minutesToTime(range.startMinute)}
                    onChange={(e) =>
                      e.target.value && set(weekday, { ...range, startMinute: timeToMinutes(e.target.value) })
                    }
                    className="h-8 rounded-[var(--radius-md)] border border-rule-strong px-2 font-mono text-[0.8125rem]"
                  />
                  –
                  <input
                    type="time"
                    step={900}
                    aria-label={`${name} to`}
                    value={minutesToTime(Math.min(range.endMinute, 1439))}
                    onChange={(e) =>
                      e.target.value && set(weekday, { ...range, endMinute: timeToMinutes(e.target.value) })
                    }
                    className="h-8 rounded-[var(--radius-md)] border border-rule-strong px-2 font-mono text-[0.8125rem]"
                  />
                </span>
              ) : (
                <span className="text-sm text-ink-3">Closed</span>
              )}
              {range && range.endMinute <= range.startMinute && (
                <span className="text-xs text-danger-700">Ends before it starts</span>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
