'use client';

import { useActionState, useState } from 'react';
import { TextArea } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE_RESULT } from '@/lib/action-result';
import { cancelOwnBookingAction } from './actions';

export function CancelBookingForm({
  slug,
  token,
  windowHours,
}: {
  slug: string;
  token: string;
  windowHours: number;
}) {
  const [state, formAction] = useActionState(cancelOwnBookingAction, IDLE_RESULT);
  const [confirming, setConfirming] = useState(false);

  if (state.ok && state.message)
    return (
      <FormMessage tone="success" className="mt-8">
        {state.message}
      </FormMessage>
    );

  return (
    <div className="mt-8">
      {!state.ok && (
        <FormMessage tone="error" className="mb-4">
          {state.message}
        </FormMessage>
      )}
      {!confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">
            Plans changed? You can cancel free of charge up to {windowHours} hours before.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-10 rounded-[var(--radius-md)] border border-danger-600/40 bg-surface px-4 text-sm font-medium text-danger-700 hover:bg-danger-50"
          >
            Cancel booking…
          </button>
        </div>
      ) : (
        <form
          action={formAction}
          className="space-y-4 rounded-[var(--radius-lg)] border border-rule bg-surface p-4"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="token" value={token} />
          <TextArea label="Anything we should know?" name="reason" optional maxLength={300} rows={2} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" pendingLabel="Cancelling…">
              Yes, cancel my booking
            </SubmitButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-10 px-3 text-sm text-ink-2 hover:text-ink"
            >
              Keep it
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
