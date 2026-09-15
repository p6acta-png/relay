'use client';

import { useActionState, useState } from 'react';
import { controlClasses } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { submitWithoutReset } from '@/components/ui/submit-without-reset';
import { IDLE_RESULT } from '@/lib/action-result';
import { cx } from '@/lib/cx';
import { saveStaffAction } from '../../actions';
import { WeekHoursEditor, type DayRange } from '../../_components/week-hours';

interface StaffValues {
  displayName: string;
  title: string;
  active: boolean;
  membershipId: string;
  hours: DayRange[];
}

export function StaffForm({
  id,
  initial,
  members,
  canManage,
}: {
  id: string;
  initial: StaffValues;
  members: { id: string; label: string; linkedTo: string | null }[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveStaffAction, IDLE_RESULT);
  const [values, setValues] = useState(initial);
  const set = <K extends keyof StaffValues>(key: K, value: StaffValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  const hourErrors = Object.entries(errors).filter(([key]) => key.startsWith('hours'));

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-6">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payload" value={JSON.stringify(values)} />
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}

      <fieldset
        disabled={!canManage}
        className="space-y-5 rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
      >
        <legend className="sr-only">Staff member</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="st-name" className="mb-1.5 block text-sm font-medium">
              Name customers see
            </label>
            <input
              id="st-name"
              value={values.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              className={cx(controlClasses, 'h-10')}
              aria-invalid={errors.displayName ? true : undefined}
              aria-describedby="st-name-error"
            />
            {errors.displayName && (
              <p id="st-name-error" className="mt-1 text-[0.8125rem] font-medium text-danger-700">
                {errors.displayName}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="st-title" className="mb-1.5 block text-sm font-medium">
              Title <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input
              id="st-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ski technician"
              className={cx(controlClasses, 'h-10')}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="st-member" className="mb-1.5 block text-sm font-medium">
              Dashboard login
            </label>
            <select
              id="st-member"
              value={values.membershipId}
              onChange={(e) => set('membershipId', e.target.value)}
              className={cx(controlClasses, 'h-10 sm:w-96')}
              aria-invalid={errors.membershipId ? true : undefined}
              aria-describedby="st-member-hint"
            >
              <option value="">No login — schedule only</option>
              {members.map((m) => (
                <option key={m.id} value={m.id} disabled={Boolean(m.linkedTo)}>
                  {m.label}
                  {m.linkedTo ? ` — already ${m.linkedTo}` : ''}
                </option>
              ))}
            </select>
            <p
              id="st-member-hint"
              className={cx(
                'mt-1 text-[0.8125rem]',
                errors.membershipId ? 'font-medium text-danger-700' : 'text-ink-3',
              )}
            >
              {errors.membershipId ??
                'Optional. Connects this schedule to the person who signs in, so the team knows whose calendar it is.'}
            </p>
          </div>
        </div>

        <div>
          <WeekHoursEditor
            label="Working hours"
            value={values.hours}
            onChange={(hours) => set('hours', hours)}
            disabled={!canManage}
          />
          {hourErrors.map(([key, message]) => (
            <p key={key} className="mt-1 text-[0.8125rem] font-medium text-danger-700">
              {message}
            </p>
          ))}
        </div>

        <label className="flex items-start gap-2 border-t border-rule pt-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-pine-700"
            checked={values.active}
            onChange={(e) => set('active', e.target.checked)}
          />
          <span>
            <span className="font-medium">Takes bookings</span>
            <span className="block text-[0.8125rem] text-ink-3">
              Untick when someone leaves or is away long-term. Their past bookings stay.
            </span>
          </span>
        </label>
      </fieldset>

      {canManage && (
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            {id ? 'Save changes' : 'Add staff member'}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
