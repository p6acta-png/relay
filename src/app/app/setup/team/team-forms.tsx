'use client';

import { useActionState, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/field';
import { DemoModeTag, FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { submitWithoutReset } from '@/components/ui/submit-without-reset';
import { IDLE_RESULT, fieldError, previousValue, type ActionResult } from '@/lib/action-result';
import { changeRoleAction, inviteAction, removeMemberAction } from '../actions';

type Role = 'OWNER' | 'ADMIN' | 'STAFF';
const LABELS: Record<Role, string> = { OWNER: 'Owner', ADMIN: 'Admin', STAFF: 'Staff' };

export function InviteForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  const [state, formAction] = useActionState(inviteAction, IDLE_RESULT as ActionResult<{ url: string }>);
  const [copied, setCopied] = useState(false);
  const url = state.ok ? state.data?.url : undefined;

  return (
    <div className="space-y-4">
      <form key={url ?? 'invite'} action={formAction} className="space-y-4">
        {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="off"
          defaultValue={previousValue(state, 'email')}
          error={fieldError(state, 'email')}
        />
        <SelectField label="Role" name="role" defaultValue={previousValue(state, 'role') ?? 'STAFF'}>
          <option value="STAFF">Staff — daily work</option>
          {canInviteAdmin && <option value="ADMIN">Admin — also setup and team</option>}
        </SelectField>
        <SubmitButton pendingLabel="Sending…" className="w-full">
          Send invitation
        </SubmitButton>
      </form>
      {url && (
        <div
          className="space-y-2 rounded-[var(--radius-md)] border border-dashed border-signal-500/50 bg-signal-50/60 p-3"
          role="status"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <DemoModeTag>Outbox</DemoModeTag> {state.ok && state.message}
          </p>
          <p className="text-[0.8125rem] text-ink-2">
            No real email is sent locally. Open the link in a private window to accept:
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              aria-label="Invitation link"
              className="h-8 min-w-0 flex-1 rounded-[var(--radius-md)] border border-rule-strong bg-white px-2 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="h-8 rounded-[var(--radius-md)] border border-rule-strong bg-white px-2.5 text-xs font-medium hover:border-ink-3"
              onClick={async () => {
                await navigator.clipboard?.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MemberControls({
  membershipId,
  name,
  role,
  assignableRoles,
}: {
  membershipId: string;
  name: string;
  role: Role;
  assignableRoles: readonly Role[];
}) {
  const [roleState, roleAction, rolePending] = useActionState(changeRoleAction, IDLE_RESULT);
  const [removeState, removeAction] = useActionState(removeMemberAction, IDLE_RESULT);
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<Role>(role);
  const error = !roleState.ok ? roleState.message : !removeState.ok ? removeState.message : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitWithoutReset(roleAction)} className="flex items-center gap-1.5">
          <input type="hidden" name="membershipId" value={membershipId} />
          <label className="sr-only" htmlFor={`role-${membershipId}`}>
            Role for {name}
          </label>
          <select
            id={`role-${membershipId}`}
            name="role"
            value={selected}
            onChange={(e) => setSelected(e.target.value as Role)}
            className="h-8 rounded-[var(--radius-md)] border border-rule-strong bg-white px-2 text-[0.8125rem]"
          >
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {LABELS[r]}
              </option>
            ))}
          </select>
          {/* An explicit button: changing a role on every arrow-key press in the select would be too easy. */}
          {selected !== role && (
            <SubmitButton size="sm" variant="secondary" pending={rolePending} pendingLabel="Saving…">
              Save role
            </SubmitButton>
          )}
        </form>
        {confirming ? (
          <form action={removeAction} className="flex items-center gap-1.5">
            <input type="hidden" name="membershipId" value={membershipId} />
            <SubmitButton variant="danger" size="sm" pendingLabel="Removing…">
              Remove {name.split(' ')[0]}
            </SubmitButton>
            <button
              type="button"
              className="text-xs text-ink-2 hover:text-ink"
              onClick={() => setConfirming(false)}
            >
              Keep
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="h-8 px-2 text-xs text-ink-3 hover:text-danger-700"
            onClick={() => setConfirming(true)}
          >
            Remove…
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger-700">
          {error}
        </p>
      )}
      {roleState.ok && roleState.message && (
        <p role="status" className="text-xs text-pine-700">
          {roleState.message}
        </p>
      )}
    </div>
  );
}
