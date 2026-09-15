'use client';

import { useActionState } from 'react';
import { TextArea, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE_RESULT, fieldError, previousValue } from '@/lib/action-result';
import { simulateEmailAction } from '../actions';

const EXAMPLES = [
  {
    label: 'Answerable',
    subject: 'Parking?',
    body: 'Hi! Is there anywhere to park when I drop off my bike?',
  },
  {
    label: 'Needs a person',
    subject: 'Team discount',
    body: 'Do you give discounts for a cycling club of 12 people?',
  },
];

export function SimulateEmailForm() {
  const [state, formAction] = useActionState(simulateEmailAction, IDLE_RESULT);
  const value = (name: string, fallback = '') => previousValue(state, name) ?? fallback;

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="From name"
          name="fromName"
          defaultValue={value('fromName', 'Kari Nordmann')}
          error={fieldError(state, 'fromName')}
        />
        <TextField
          label="From email"
          name="fromEmail"
          type="email"
          defaultValue={value('fromEmail', 'kari@example.com')}
          error={fieldError(state, 'fromEmail')}
        />
      </div>
      <TextField
        label="Subject"
        name="subject"
        defaultValue={value('subject', EXAMPLES[0]!.subject)}
        error={fieldError(state, 'subject')}
      />
      <TextArea
        label="Message"
        name="body"
        rows={4}
        defaultValue={value('body', EXAMPLES[0]!.body)}
        error={fieldError(state, 'body')}
      />
      <p className="text-xs text-ink-3">
        Try: “{EXAMPLES[0]!.body}” (answered from the FAQ) or “{EXAMPLES[1]!.body}” (goes to the inbox).
      </p>
      <SubmitButton pendingLabel="Receiving…" className="w-full">
        Receive email
      </SubmitButton>
    </form>
  );
}
