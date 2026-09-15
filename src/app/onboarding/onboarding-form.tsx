'use client';

import { useActionState, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { fieldError, IDLE_RESULT, previousValue } from '@/lib/action-result';
import { createBusinessAction } from './actions';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/&/g, 'og')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-6 border-t border-rule py-8 md:grid-cols-[14rem_1fr]">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="font-mono text-xs text-ink-3">{number}</p>
        <p className="mt-1 font-medium">{title}</p>
        <p className="mt-1 text-sm text-ink-3">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

export function OnboardingForm({ ownerName }: { ownerName: string }) {
  const [state, formAction] = useActionState(createBusinessAction, IDLE_RESULT);
  const [name, setName] = useState(previousValue(state, 'businessName') ?? '');
  const [slug, setSlug] = useState(previousValue(state, 'slug') ?? '');
  const [slugEdited, setSlugEdited] = useState(false);
  const [saturday, setSaturday] = useState(previousValue(state, 'saturdayOpen') ?? 'no');
  const err = (n: string) => fieldError(state, n);
  const prev = (n: string, fallback = '') => previousValue(state, n) ?? fallback;

  return (
    <form action={formAction} className="mt-8" noValidate>
      {!state.ok && (
        <FormMessage tone="error" className="mb-6">
          {state.message}
        </FormMessage>
      )}

      <Section
        number="01"
        title="Your business"
        description="Shown to customers on your Relay page and in emails."
      >
        <TextField
          label="Business name"
          name="businessName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          error={err('businessName')}
          autoComplete="organization"
        />
        <TextField
          label="Web address"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
          hint={
            <>
              Your page will be at <span className="font-mono text-ink-2">/w/{slug || 'your-business'}</span>
            </>
          }
          error={err('slug')}
          spellCheck={false}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="City" name="city" optional defaultValue={prev('city')} error={err('city')} />
          <TextField
            label="Contact email"
            name="contactEmail"
            type="email"
            optional
            defaultValue={prev('contactEmail')}
            error={err('contactEmail')}
          />
        </div>
      </Section>

      <Section
        number="02"
        title="Opening hours"
        description={`We’ll use these as ${ownerName.split(' ')[0]}’s working hours to begin with.`}
      >
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Weekdays open"
            name="weekdayOpens"
            type="time"
            step={900}
            defaultValue={prev('weekdayOpens', '08:00')}
            error={err('weekdayOpens')}
          />
          <TextField
            label="Weekdays close"
            name="weekdayCloses"
            type="time"
            step={900}
            defaultValue={prev('weekdayCloses', '16:00')}
            error={err('weekdayCloses')}
          />
        </div>
        <SelectField
          label="Saturdays"
          name="saturdayOpen"
          value={saturday}
          onChange={(e) => setSaturday(e.target.value)}
        >
          <option value="no">Closed</option>
          <option value="yes">Open</option>
        </SelectField>
        {saturday === 'yes' && (
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Saturday open"
              name="saturdayOpens"
              type="time"
              step={900}
              defaultValue={prev('saturdayOpens', '10:00')}
              error={err('saturdayOpens')}
            />
            <TextField
              label="Saturday close"
              name="saturdayCloses"
              type="time"
              step={900}
              defaultValue={prev('saturdayCloses', '14:00')}
              error={err('saturdayCloses')}
            />
          </div>
        )}
      </Section>

      <Section number="03" title="First service" description="Something customers can book straight away.">
        <TextField
          label="Service name"
          name="serviceName"
          placeholder="e.g. Standard bike service"
          defaultValue={prev('serviceName')}
          error={err('serviceName')}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Duration (minutes)"
            name="serviceDurationMinutes"
            type="number"
            inputMode="numeric"
            min={15}
            max={480}
            step={15}
            defaultValue={prev('serviceDurationMinutes', '60')}
            error={err('serviceDurationMinutes')}
          />
          <TextField
            label="Price (NOK)"
            name="servicePriceNok"
            type="number"
            inputMode="decimal"
            min={0}
            optional
            defaultValue={prev('servicePriceNok')}
            error={err('servicePriceNok')}
          />
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3 border-t border-rule pt-6">
        <SubmitButton size="lg" pendingLabel="Setting up…">
          Create business
        </SubmitButton>
      </div>
    </form>
  );
}
