'use client';

import { useActionState } from 'react';
import { TextArea, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE_RESULT, fieldError, previousValue } from '@/lib/action-result';
import { saveKnowledgeAction } from '../../actions';

export function KnowledgeForm({
  id,
  initial,
  canManage,
}: {
  id: string;
  initial: { question: string; answer: string; keywords: string; published: boolean };
  canManage: boolean;
}) {
  const [state, formAction] = useActionState(saveKnowledgeAction, IDLE_RESULT);
  const value = (name: 'question' | 'answer' | 'keywords') => previousValue(state, name) ?? initial[name];

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      <fieldset
        disabled={!canManage}
        className="space-y-4 rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
      >
        <legend className="sr-only">Answer</legend>
        <TextField
          key={`q-${value('question')}`}
          label="Question"
          name="question"
          maxLength={200}
          defaultValue={value('question')}
          error={fieldError(state, 'question')}
          hint="As a customer would ask it: “Can I park outside?”"
        />
        <TextArea
          key={`a-${value('answer')}`}
          label="Answer"
          name="answer"
          rows={5}
          maxLength={1500}
          defaultValue={value('answer')}
          error={fieldError(state, 'answer')}
          hint="Relay sends this exactly as written, so keep it short and accurate."
        />
        <TextField
          key={`k-${value('keywords')}`}
          label="Words customers use"
          name="keywords"
          optional
          maxLength={500}
          defaultValue={value('keywords')}
          error={fieldError(state, 'keywords')}
          hint="Comma separated, e.g. parking, car, park. The demo AI matches on these."
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="published"
            className="mt-0.5 size-4 accent-pine-700"
            defaultChecked={state.ok ? initial.published : previousValue(state, 'published') === 'on'}
          />
          <span>
            <span className="font-medium">Published</span>
            <span className="block text-[0.8125rem] text-ink-3">
              Drafts are kept here but Relay won’t use them.
            </span>
          </span>
        </label>
      </fieldset>
      {canManage && (
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Saving…">Save answer</SubmitButton>
        </div>
      )}
    </form>
  );
}
