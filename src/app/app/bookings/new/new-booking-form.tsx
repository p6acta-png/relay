'use client';

import { useActionState, useState } from 'react';
import { SelectField, TextArea, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { fieldError, IDLE_RESULT, previousValue } from '@/lib/action-result';
import { createBookingAction } from '../actions';
import { SlotPicker } from '../_components/slot-picker';

export function NewBookingForm({
  services,
  today,
}: {
  services: { id: string; label: string }[];
  today: string;
}) {
  const [state, formAction] = useActionState(createBookingAction, IDLE_RESULT);
  const [serviceId, setServiceId] = useState(previousValue(state, 'serviceId') ?? '');
  const err = (name: string) => fieldError(state, name) ?? fieldError(state, `customer.${name}`);

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}

      <section className="space-y-5 rounded-[var(--radius-lg)] border border-rule bg-surface p-5">
        <SelectField
          label="Service"
          name="serviceId"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          error={err('serviceId')}
        >
          <option value="" disabled>
            Choose a service
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <SlotPicker serviceId={serviceId} initialDate={today} minDate={today} />
        {err('startsAt') && <p className="text-sm text-danger-700">{err('startsAt')}</p>}
      </section>

      <section className="space-y-4 rounded-[var(--radius-lg)] border border-rule bg-surface p-5">
        <h2 className="text-sm font-medium">Customer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Name"
            name="name"
            autoComplete="off"
            defaultValue={previousValue(state, 'name')}
            error={err('name')}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={previousValue(state, 'email')}
            error={err('email')}
            hint="The confirmation and manage link go here."
          />
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            optional
            defaultValue={previousValue(state, 'phone')}
            error={err('phone')}
          />
        </div>
        <TextArea
          label="Notes for the workshop"
          name="notes"
          optional
          rows={2}
          maxLength={500}
          defaultValue={previousValue(state, 'notes')}
        />
      </section>

      <div className="flex justify-end">
        <SubmitButton size="lg" pendingLabel="Booking…">
          Create booking
        </SubmitButton>
      </div>
    </form>
  );
}
