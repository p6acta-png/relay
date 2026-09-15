'use client';

import { useActionState, useState } from 'react';
import { controlClasses } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { submitWithoutReset } from '@/components/ui/submit-without-reset';
import { IDLE_RESULT } from '@/lib/action-result';
import { cx } from '@/lib/cx';
import { saveServiceAction } from '../../actions';

interface ServiceValues {
  name: string;
  description: string;
  kind: 'BOOKABLE' | 'QUOTE';
  durationMinutes: number;
  priceNok: string;
  priceIsFrom: boolean;
  confirmationMode: 'INSTANT' | 'APPROVAL';
  keywords: string;
  active: boolean;
  staffIds: string[];
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-[0.8125rem] font-medium text-danger-700">
      {message}
    </p>
  ) : null;
}

export function ServiceForm({
  id,
  initial,
  staff,
  canManage,
}: {
  id: string;
  initial: ServiceValues;
  staff: { id: string; name: string; active: boolean }[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveServiceAction, IDLE_RESULT);
  const [values, setValues] = useState(initial);
  const set = <K extends keyof ServiceValues>(key: K, value: ServiceValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  const bookable = values.kind === 'BOOKABLE';
  const payload = { ...values, durationMinutes: bookable ? values.durationMinutes : null };

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-6">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}

      <fieldset
        disabled={!canManage}
        className="space-y-5 rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
      >
        <legend className="sr-only">Service details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="s-name" className="mb-1.5 block text-sm font-medium">
              Name
            </label>
            <input
              id="s-name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              className={cx(controlClasses, 'h-10')}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby="s-name-error"
            />
            <FieldError id="s-name-error" message={errors.name} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="s-description" className="mb-1.5 block text-sm font-medium">
              Description <span className="font-normal text-ink-3">(shown on your page and in the chat)</span>
            </label>
            <textarea
              id="s-description"
              rows={2}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className={cx(controlClasses, 'py-2')}
            />
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">How customers get it</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['BOOKABLE', 'Book a time', 'Relay offers free times and books them.'],
                ['QUOTE', 'Ask for a quote', 'Relay collects details and creates a lead for the team.'],
              ] as const
            ).map(([kind, title, text]) => (
              <label
                key={kind}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border bg-white p-3',
                  values.kind === kind ? 'border-pine-600 ring-1 ring-pine-600' : 'border-rule-strong',
                )}
              >
                <input
                  type="radio"
                  name="kind-choice"
                  className="mt-1 accent-pine-700"
                  checked={values.kind === kind}
                  onChange={() => set('kind', kind)}
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-[0.8125rem] text-ink-3">{text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          {bookable && (
            <div>
              <label htmlFor="s-duration" className="mb-1.5 block text-sm font-medium">
                Duration
              </label>
              <span className="flex items-center gap-2">
                <input
                  id="s-duration"
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={values.durationMinutes}
                  onChange={(e) => set('durationMinutes', Number(e.target.value))}
                  className={cx(controlClasses, 'h-10 max-w-24 font-mono')}
                  aria-invalid={errors.durationMinutes ? true : undefined}
                  aria-describedby="s-duration-error"
                />
                <span className="text-sm text-ink-2">min</span>
              </span>
              <FieldError id="s-duration-error" message={errors.durationMinutes} />
            </div>
          )}
          <div>
            <label htmlFor="s-price" className="mb-1.5 block text-sm font-medium">
              Price
            </label>
            <span className="flex items-center gap-2">
              <input
                id="s-price"
                inputMode="decimal"
                placeholder="On request"
                value={values.priceNok}
                onChange={(e) => set('priceNok', e.target.value)}
                className={cx(controlClasses, 'h-10 max-w-28 font-mono')}
                aria-invalid={errors.priceNok ? true : undefined}
                aria-describedby="s-price-error"
              />
              <span className="text-sm text-ink-2">kr</span>
            </span>
            <FieldError id="s-price-error" message={errors.priceNok} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-pine-700"
              checked={values.priceIsFrom}
              onChange={(e) => set('priceIsFrom', e.target.checked)}
            />
            Show as “from” price
          </label>
        </div>

        {bookable && (
          <div>
            <label htmlFor="s-confirmation" className="mb-1.5 block text-sm font-medium">
              When a customer books
            </label>
            <select
              id="s-confirmation"
              value={values.confirmationMode}
              onChange={(e) => set('confirmationMode', e.target.value as ServiceValues['confirmationMode'])}
              className={cx(controlClasses, 'h-10 sm:w-80')}
            >
              <option value="INSTANT">Confirm instantly</option>
              <option value="APPROVAL">Hold as a request until staff approve</option>
            </select>
            <p className="mt-1 text-[0.8125rem] text-ink-3">
              Use approval for jobs where someone should check the details first. The time is still held, so
              it can’t be double-booked.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="s-keywords" className="mb-1.5 block text-sm font-medium">
            Words customers use
          </label>
          <input
            id="s-keywords"
            value={values.keywords}
            onChange={(e) => set('keywords', e.target.value)}
            placeholder="flat tyre, puncture, tube"
            className={cx(controlClasses, 'h-10')}
            aria-describedby="s-keywords-hint"
          />
          <p id="s-keywords-hint" className="mt-1 text-[0.8125rem] text-ink-3">
            Comma separated. The demo AI matches these alongside the service name.
          </p>
        </div>

        {bookable && (
          <fieldset aria-describedby="s-staff-error">
            <legend className="mb-1.5 text-sm font-medium">Who can do it</legend>
            {staff.length === 0 ? (
              <p className="text-sm text-ink-3">Add staff under Staff & hours first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {staff.map((person) => {
                  const checked = values.staffIds.includes(person.id);
                  return (
                    <label
                      key={person.id}
                      className={cx(
                        'flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border bg-white px-3 text-sm',
                        checked ? 'border-pine-600' : 'border-rule-strong',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-pine-700"
                        checked={checked}
                        onChange={(e) =>
                          set(
                            'staffIds',
                            e.target.checked
                              ? [...values.staffIds, person.id]
                              : values.staffIds.filter((s) => s !== person.id),
                          )
                        }
                      />
                      {person.name}
                      {!person.active && <span className="text-xs text-ink-3">(inactive)</span>}
                    </label>
                  );
                })}
              </div>
            )}
            <FieldError id="s-staff-error" message={errors.staffIds} />
          </fieldset>
        )}

        <label className="flex items-start gap-2 border-t border-rule pt-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-pine-700"
            checked={values.active}
            onChange={(e) => set('active', e.target.checked)}
          />
          <span>
            <span className="font-medium">Offered to customers</span>
            <span className="block text-[0.8125rem] text-ink-3">
              Untick to hide it from the chat and your page. Existing bookings stay.
            </span>
          </span>
        </label>
      </fieldset>

      {canManage && (
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            {id ? 'Save service' : 'Create service'}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
