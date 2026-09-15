'use client';

import { useActionState } from 'react';
import { TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE_RESULT, previousValue } from '@/lib/action-result';
import { loginAction } from '../actions';

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, IDLE_RESULT);

  return (
    <form action={formAction} className="mt-8 space-y-4" noValidate>
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={previousValue(state, 'email')}
        autoFocus
      />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" />
      <SubmitButton className="w-full" size="lg" pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
