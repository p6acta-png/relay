'use client';

import { useActionState } from 'react';
import { SelectField, TextArea, TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { fieldError, IDLE_RESULT } from '@/lib/action-result';
import { createTaskAction } from './actions';

export function NewTaskForm({ team }: { team: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(createTaskAction, IDLE_RESULT);
  return (
    <form
      action={formAction}
      className="space-y-3 rounded-[var(--radius-lg)] border border-rule bg-surface p-4"
    >
      <h2 className="text-sm font-semibold">Add a task</h2>
      {!state.ok && !state.fieldErrors && <FormMessage tone="error">{state.message}</FormMessage>}
      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}
      <TextField label="Title" name="title" maxLength={160} error={fieldError(state, 'title')} />
      <TextArea label="Details" name="details" optional rows={2} maxLength={2000} />
      <SelectField label="Assign to" name="assigneeId" optional defaultValue="">
        <option value="">Unassigned</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </SelectField>
      <TextField label="Due date" name="dueDate" type="date" optional />
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add task
      </SubmitButton>
    </form>
  );
}
