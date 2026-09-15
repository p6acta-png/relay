'use client';

import { useActionState } from 'react';
import { Honeypot, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { fieldError, IDLE_RESULT, previousValue } from '@/lib/action-result';
import { signupAction } from '../actions';

export function SignupForm({ formToken }: { formToken: string }) {
  const [state, formAction] = useActionState(signupAction, IDLE_RESULT);

  return (
    <form action={formAction} className="relative mt-8 space-y-4" noValidate>
      {!state.ok && !state.fieldErrors && <FormMessage tone="error">{state.message}</FormMessage>}
      <input type="hidden" name="formToken" value={formToken} />
      <Honeypot />
      <TextField
        label="Your name"
        name="name"
        autoComplete="name"
        defaultValue={previousValue(state, 'name')}
        error={fieldError(state, 'name')}
      />
      <TextField
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={previousValue(state, 'email')}
        error={fieldError(state, 'email')}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        hint="At least 10 characters. A few unrelated words work well."
        error={fieldError(state, 'password')}
      />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
        Continue
      </SubmitButton>
    </form>
  );
}
