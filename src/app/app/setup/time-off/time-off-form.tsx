'use client';

import { useActionState } from 'react';
import { SelectField, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE_RESULT, fieldError, previousValue } from '@/lib/action-result';
import { addTimeOffAction } from '../actions';

export function TimeOffForm({ today, staff }: { today: string; staff: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(addTimeOffAction, IDLE_RESULT);

  return (
    // key resets the inputs after a successful save
    <form key={state.ok ? state.message : 'form'} action={formAction} className="space-y-4">
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}
      <SelectField
        label="Who"
        name="staffMemberId"
        optional
        defaultValue={previousValue(state, 'staffMemberId') ?? ''}
      >
        <option value="">Whole business (closed)</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="From"
          name="startDate"
          type="date"
          min={today}
          defaultValue={previousValue(state, 'startDate') ?? today}
          error={fieldError(state, 'startsAt')}
        />
        <TextField
          label="To"
          name="endDate"
          type="date"
          min={today}
          optional
          defaultValue={previousValue(state, 'endDate')}
          error={fieldError(state, 'endsAt')}
        />
      </div>
      {/* Uncontrolled, so React's post-submit form reset can't leave it out of step; CSS shows the times. */}
      <div className="group space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="partDay"
            className="size-4 accent-pine-700"
            defaultChecked={previousValue(state, 'partDay') === 'on'}
          />
          Only part of the day
        </label>
        <div className="hidden grid-cols-2 gap-3 group-has-[input[name=partDay]:checked]:grid">
          <TextField label="Start time" name="startTime" type="time" step={900} defaultValue="12:00" />
          <TextField label="End time" name="endTime" type="time" step={900} defaultValue="17:00" />
        </div>
      </div>
      <TextField
        label="Reason"
        name="reason"
        optional
        maxLength={120}
        placeholder="Winter holiday"
        hint="Only the team sees this."
        defaultValue={previousValue(state, 'reason')}
      />
      <SubmitButton pendingLabel="Adding…" className="w-full">
        Add time off
      </SubmitButton>
    </form>
  );
}
