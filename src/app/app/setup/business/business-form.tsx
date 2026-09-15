'use client';

import { useActionState, useState } from 'react';
import { controlClasses } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { submitWithoutReset } from '@/components/ui/submit-without-reset';
import { IDLE_RESULT } from '@/lib/action-result';
import { cx } from '@/lib/cx';
import { saveBusinessAction } from '../actions';
import { WeekHoursEditor, type DayRange } from '../_components/week-hours';

interface Settings {
  name: string;
  tagline: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  openingHours: DayRange[];
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  cancellationWindowHours: number;
  slotIntervalMinutes: number;
  handoffReplyHours: number;
}

export function BusinessForm({
  initial,
  canManage,
  slug,
}: {
  initial: Settings;
  canManage: boolean;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(saveBusinessAction, IDLE_RESULT);
  const [values, setValues] = useState(initial);
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const payload = {
    ...values,
    openingHours: values.openingHours.map((r) => ({
      weekday: r.weekday,
      opens: r.startMinute,
      closes: r.endMinute,
    })),
  };

  const text = (
    key: 'name' | 'tagline' | 'contactEmail' | 'contactPhone' | 'addressLine' | 'city',
    label: string,
    hint?: string,
  ) => (
    <div>
      <label htmlFor={`b-${key}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={`b-${key}`}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        className={cx(controlClasses, 'h-10')}
        aria-invalid={errors[key] ? true : undefined}
      />
      {errors[key] ? (
        <p className="mt-1 text-[0.8125rem] text-danger-700">{errors[key]}</p>
      ) : (
        hint && <p className="mt-1 text-[0.8125rem] text-ink-3">{hint}</p>
      )}
    </div>
  );

  const number = (
    key: 'minNoticeMinutes' | 'bookingHorizonDays' | 'cancellationWindowHours' | 'handoffReplyHours',
    label: string,
    unit: string,
    hint: string,
  ) => (
    <div>
      <label htmlFor={`b-${key}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <span className="flex items-center gap-2">
        <input
          id={`b-${key}`}
          type="number"
          min={0}
          value={values[key]}
          onChange={(e) => set(key, Number(e.target.value))}
          className={cx(controlClasses, 'h-10 max-w-28 font-mono')}
          aria-describedby={`b-${key}-hint`}
          aria-invalid={errors[key] ? true : undefined}
        />
        <span className="text-sm text-ink-2">{unit}</span>
      </span>
      <p
        id={`b-${key}-hint`}
        className={cx('mt-1 text-[0.8125rem]', errors[key] ? 'text-danger-700' : 'text-ink-3')}
      >
        {errors[key] ?? hint}
      </p>
    </div>
  );

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-8">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}

      <fieldset disabled={!canManage} className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <legend className="sr-only">Business profile</legend>
        <div aria-hidden>
          <p className="font-medium">Profile</p>
          <p className="mt-1 text-sm text-ink-3">
            Shown on <span className="font-mono">/w/{slug}</span> and used in replies and emails.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('name', 'Business name')}
          {text('tagline', 'Tagline', 'One line, e.g. “Bike and ski workshop on Torshov”.')}
          <div className="sm:col-span-2">
            <label htmlFor="b-description" className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <textarea
              id="b-description"
              rows={3}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className={cx(controlClasses, 'py-2')}
            />
          </div>
          {text('contactEmail', 'Contact email')}
          {text('contactPhone', 'Phone')}
          {text('addressLine', 'Address')}
          {text('city', 'City')}
        </div>
      </fieldset>

      <fieldset
        disabled={!canManage}
        className="grid gap-6 border-t border-rule pt-8 lg:grid-cols-[14rem_1fr]"
      >
        <legend className="sr-only">Opening hours</legend>
        <div aria-hidden>
          <p className="font-medium">Opening hours</p>
          <p className="mt-1 text-sm text-ink-3">
            What customers see and what “open/closed” means in automations. Bookable times come from each
            person’s working hours.
          </p>
        </div>
        <div>
          <WeekHoursEditor
            label="Open on"
            value={values.openingHours}
            onChange={(openingHours) => set('openingHours', openingHours)}
            disabled={!canManage}
          />
          {Object.entries(errors)
            .filter(([k]) => k.startsWith('openingHours'))
            .map(([k, m]) => (
              <p key={k} className="mt-1 text-[0.8125rem] text-danger-700">
                {m}
              </p>
            ))}
        </div>
      </fieldset>

      <fieldset
        disabled={!canManage}
        className="grid gap-6 border-t border-rule pt-8 lg:grid-cols-[14rem_1fr]"
      >
        <legend className="sr-only">Booking rules</legend>
        <div aria-hidden>
          <p className="font-medium">Booking rules</p>
          <p className="mt-1 text-sm text-ink-3">
            Relay enforces these for every booking — from the chat and from the dashboard.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {number('minNoticeMinutes', 'Minimum notice', 'minutes', 'No bookings closer to “now” than this.')}
          {number(
            'bookingHorizonDays',
            'Book up to',
            'days ahead',
            'How far into the future times are offered.',
          )}
          {number(
            'cancellationWindowHours',
            'Online cancellation until',
            'hours before',
            'After that, customers must contact you.',
          )}
          {number(
            'handoffReplyHours',
            'Promised reply time',
            'hours',
            'What Relay tells customers after a hand-off.',
          )}
          <div>
            <label htmlFor="b-slot" className="mb-1.5 block text-sm font-medium">
              Time slots every
            </label>
            <select
              id="b-slot"
              value={values.slotIntervalMinutes}
              onChange={(e) => set('slotIntervalMinutes', Number(e.target.value))}
              className={cx(controlClasses, 'h-10 max-w-40')}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>
        </div>
      </fieldset>

      {canManage && (
        <div className="flex justify-end border-t border-rule pt-6">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save changes
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
