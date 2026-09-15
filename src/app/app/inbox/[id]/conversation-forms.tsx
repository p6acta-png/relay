'use client';

import { useActionState, useRef } from 'react';
import { TextArea } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { fieldError, IDLE_RESULT, previousValue } from '@/lib/action-result';
import { assignConversationAction, replyAction } from '../actions';

export function ReplyForm({
  conversationId,
  customerEmail,
}: {
  conversationId: string;
  customerEmail: string | null;
}) {
  const [state, formAction] = useActionState(replyAction, IDLE_RESULT);
  return (
    <form action={formAction} className="rounded-[var(--radius-lg)] border border-rule bg-surface p-4">
      <input type="hidden" name="conversationId" value={conversationId} />
      <TextArea
        label="Reply to the customer"
        name="body"
        rows={3}
        maxLength={4000}
        defaultValue={previousValue(state, 'body')}
        error={fieldError(state, 'body')}
        hint={
          customerEmail
            ? `Shown in the chat and emailed to ${customerEmail} (demo outbox). Relay stays paused after you reply.`
            : 'Shown in the chat if the customer comes back. Relay stays paused after you reply.'
        }
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-5 text-sm">
          {state.ok && state.message && (
            <span className="text-pine-700" role="status">
              {state.message}
            </span>
          )}
          {!state.ok && !state.fieldErrors && <FormMessage tone="error">{state.message}</FormMessage>}
        </div>
        <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
      </div>
    </form>
  );
}

export function AssignSelect({
  conversationId,
  current,
  team,
}: {
  conversationId: string;
  current: string | null;
  team: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={assignConversationAction}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="assignee" className="eyebrow block">
        Assigned to
      </label>
      <select
        id="assignee"
        name="membershipId"
        defaultValue={current ?? ''}
        onChange={() => formRef.current?.requestSubmit()}
        className="mt-2 h-9 w-full rounded-[var(--radius-md)] border border-rule-strong bg-white px-2 text-sm"
      >
        <option value="">Nobody yet</option>
        {team.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="mt-2 text-sm underline">
          Save
        </button>
      </noscript>
    </form>
  );
}
