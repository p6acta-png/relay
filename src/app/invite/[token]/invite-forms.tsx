'use client';

import { useActionState } from 'react';
import { Honeypot, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { fieldError, IDLE_RESULT, previousValue } from '@/lib/action-result';
import { acceptInviteAction, joinWithNewAccountAction } from './actions';

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptInviteAction, IDLE_RESULT);
  return (
    <form action={formAction} className="mt-6 space-y-3">
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      <input type="hidden" name="token" value={token} />
      <SubmitButton size="lg" pendingLabel="Joining…">
        Accept and open dashboard
      </SubmitButton>
    </form>
  );
}

export function JoinInviteForm({ token, formToken }: { token: string; formToken: string }) {
  const [state, formAction] = useActionState(joinWithNewAccountAction, IDLE_RESULT);
  return (
    <form action={formAction} className="relative mt-8 space-y-4" noValidate>
      {!state.ok && !state.fieldErrors && <FormMessage tone="error">{state.message}</FormMessage>}
      <input type="hidden" name="token" value={token} />
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
        label="Choose a password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={fieldError(state, 'password')}
      />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
        Create account and join
      </SubmitButton>
    </form>
  );
}
