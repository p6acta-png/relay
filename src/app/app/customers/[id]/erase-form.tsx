'use client';

import { useActionState, useState } from 'react';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE_RESULT } from '@/lib/action-result';
import { eraseCustomerAction } from '../actions';

export function EraseCustomerForm({ customerId, name }: { customerId: string; name: string }) {
  const [state, formAction] = useActionState(eraseCustomerAction, IDLE_RESULT);
  const [confirm, setConfirm] = useState('');
  const expected = 'ERASE';
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      {!state.ok && (
        <FormMessage tone="error" className="w-full">
          {state.message}
        </FormMessage>
      )}
      <label className="text-sm">
        <span className="mb-1 block text-ink-2">
          Type <span className="font-mono font-medium text-ink">{expected}</span> to erase {name}
        </span>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-9 w-40 rounded-[var(--radius-md)] border border-rule-strong bg-white px-2 font-mono text-sm"
          autoComplete="off"
        />
      </label>
      <SubmitButton variant="danger" size="sm" disabled={confirm !== expected} pendingLabel="Erasing…">
        Erase personal data
      </SubmitButton>
    </form>
  );
}
