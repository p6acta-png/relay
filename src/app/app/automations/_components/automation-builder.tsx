'use client';

import { useActionState, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlClasses } from '@/components/ui/field';
import { IconClose, IconPlus } from '@/components/ui/icons';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { submitWithoutReset } from '@/components/ui/submit-without-reset';
import { IDLE_RESULT } from '@/lib/action-result';
import { cx } from '@/lib/cx';
import {
  ACTION_LABELS,
  ACTION_TRIGGERS,
  CONDITION_LABELS,
  CONDITION_TRIGGERS,
  TEMPLATE_VARIABLES,
  TRIGGERS,
  type Action,
  type AutomationDefinition,
  type Condition,
} from '@/modules/automations/definitions';
import { describeAutomation, type Names } from '@/modules/automations/describe';
import { saveAutomationAction } from '../actions';

type Trigger = AutomationDefinition['trigger'];
interface Options {
  names: Names;
  services: { id: string; name: string; active: boolean }[];
  members: { id: string; name: string; role: string }[];
}

const NEW_CONDITION: Record<Condition['type'], Condition> = {
  service_is: { type: 'service_is', serviceIds: [] },
  business_hours: { type: 'business_hours', value: 'closed' },
  customer_is: { type: 'customer_is', value: 'new' },
  channel_is: { type: 'channel_is', value: 'WEB_CHAT' },
};

const NEW_ACTION: Record<Action['type'], Action> = {
  send_chat_reply: { type: 'send_chat_reply', message: '' },
  email_customer: { type: 'email_customer', subject: '', body: '' },
  notify_team: { type: 'notify_team', roles: ['OWNER', 'ADMIN'], membershipIds: [], message: '' },
  create_task: { type: 'create_task', title: '', kind: 'FOLLOW_UP', dueInHours: 24, assigneeId: null },
  assign_to: { type: 'assign_to', membershipId: '' },
  hand_off: { type: 'hand_off' },
};

const small = cx(controlClasses, 'h-9 text-sm');

export function AutomationBuilder({
  id,
  initial,
  options,
}: {
  id?: string;
  initial: AutomationDefinition;
  options: Options;
}) {
  const [state, formAction, pending] = useActionState(saveAutomationAction, IDLE_RESULT);
  const [def, setDef] = useState<AutomationDefinition>(initial);
  const formId = useId();
  const errors = state.ok ? {} : (state.fieldErrors ?? {});

  const allowedConditions = (Object.keys(CONDITION_TRIGGERS) as Condition['type'][]).filter((t) =>
    CONDITION_TRIGGERS[t].includes(def.trigger),
  );
  const allowedActions = (Object.keys(ACTION_TRIGGERS) as Action['type'][]).filter((t) =>
    ACTION_TRIGGERS[t].includes(def.trigger),
  );

  const setTrigger = (trigger: Trigger) =>
    setDef((d) => ({
      ...d,
      trigger,
      // Drop pieces that don't fit the new trigger, instead of silently keeping invalid rules.
      conditions: d.conditions.filter((c) => CONDITION_TRIGGERS[c.type].includes(trigger)),
      actions: d.actions.filter((a) => ACTION_TRIGGERS[a.type].includes(trigger)),
    }));
  const updateCondition = (index: number, next: Condition) =>
    setDef((d) => ({ ...d, conditions: d.conditions.map((c, i) => (i === index ? next : c)) }));
  const updateAction = (index: number, next: Action) =>
    setDef((d) => ({ ...d, actions: d.actions.map((a, i) => (i === index ? next : a)) }));

  return (
    <form
      onSubmit={submitWithoutReset(formAction)}
      className="space-y-6"
      aria-describedby={`${formId}-sentence`}
    >
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="definition" value={JSON.stringify(def)} />
      {!state.ok && <FormMessage tone="error">{state.message}</FormMessage>}
      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}

      <p
        id={`${formId}-sentence`}
        className="rounded-[var(--radius-lg)] border border-pine-600/25 bg-pine-50 px-4 py-3 font-serif text-lg leading-snug text-pine-800"
      >
        {describeAutomation(def, options.names)}
      </p>

      <section className="grid gap-4 rounded-[var(--radius-lg)] border border-rule bg-surface p-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-name`} className="mb-1.5 block text-sm font-medium">
            Name
          </label>
          <input
            id={`${formId}-name`}
            value={def.name}
            onChange={(e) => setDef({ ...def, name: e.target.value })}
            className={cx(controlClasses, 'h-10')}
            aria-invalid={errors.name ? true : undefined}
            maxLength={80}
          />
          {errors.name && <p className="mt-1 text-[0.8125rem] text-danger-700">{errors.name}</p>}
        </div>
        <div className="flex items-end gap-3">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={def.enabled}
              onChange={(e) => setDef({ ...def, enabled: e.target.checked })}
              className="size-4 accent-pine-700"
            />
            Turned on
          </label>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${formId}-description`} className="mb-1.5 block text-sm font-medium">
            Why it exists <span className="font-normal text-ink-3">(optional, for your team)</span>
          </label>
          <input
            id={`${formId}-description`}
            value={def.description ?? ''}
            onChange={(e) => setDef({ ...def, description: e.target.value })}
            className={cx(controlClasses, 'h-10')}
            maxLength={300}
          />
        </div>
      </section>

      <Step number="1" title="When">
        <select
          value={def.trigger}
          onChange={(e) => setTrigger(e.target.value as Trigger)}
          className={cx(controlClasses, 'h-10')}
          aria-label="Trigger"
        >
          {(Object.keys(TRIGGERS) as Trigger[]).map((trigger) => (
            <option key={trigger} value={trigger}>
              {TRIGGERS[trigger].label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[0.8125rem] text-ink-3">{TRIGGERS[def.trigger].help}</p>
      </Step>

      <Step number="2" title="If" hint="Optional. All conditions must be true.">
        <ul className="space-y-2">
          {def.conditions.map((condition, index) => (
            <li key={index} className="rounded-[var(--radius-md)] border border-rule bg-white p-3">
              <div className="flex items-start gap-3">
                <span className="mt-2 w-24 shrink-0 text-sm text-ink-2">
                  {CONDITION_LABELS[condition.type]}
                </span>
                <div className="flex-1">
                  <ConditionEditor
                    condition={condition}
                    options={options}
                    onChange={(next) => updateCondition(index, next)}
                  />
                </div>
                <RemoveButton
                  label="Remove condition"
                  onClick={() => setDef({ ...def, conditions: def.conditions.filter((_, i) => i !== index) })}
                />
              </div>
              {errors[`conditions.${index}`] && (
                <p className="mt-2 text-[0.8125rem] text-danger-700">{errors[`conditions.${index}`]}</p>
              )}
            </li>
          ))}
        </ul>
        {def.conditions.length < 4 && (
          <AddMenu
            label="Add condition"
            items={allowedConditions.map((type) => ({ value: type, label: CONDITION_LABELS[type] }))}
            onAdd={(type) =>
              setDef({ ...def, conditions: [...def.conditions, NEW_CONDITION[type as Condition['type']]] })
            }
          />
        )}
      </Step>

      <Step
        number="3"
        title="Then"
        hint="Runs in order. If one step fails, the rest are skipped and the run is marked failed."
      >
        <ol className="space-y-2">
          {def.actions.map((action, index) => (
            <li key={index} className="rounded-[var(--radius-md)] border border-rule bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="mr-2 font-mono text-xs text-ink-3">{index + 1}.</span>
                  {ACTION_LABELS[action.type]}
                </p>
                <RemoveButton
                  label="Remove action"
                  onClick={() => setDef({ ...def, actions: def.actions.filter((_, i) => i !== index) })}
                />
              </div>
              <div className="mt-2">
                <ActionEditor
                  action={action}
                  options={options}
                  onChange={(next) => updateAction(index, next)}
                />
              </div>
              {errors[`actions.${index}`] && (
                <p className="mt-2 text-[0.8125rem] text-danger-700">{errors[`actions.${index}`]}</p>
              )}
              {Object.entries(errors)
                .filter(([key]) => key.startsWith(`actions.${index}.`))
                .map(([key, message]) => (
                  <p key={key} className="mt-1 text-[0.8125rem] text-danger-700">
                    {message}
                  </p>
                ))}
            </li>
          ))}
        </ol>
        {errors.actions && <p className="text-[0.8125rem] text-danger-700">{errors.actions}</p>}
        {def.actions.length < 5 && (
          <AddMenu
            label="Add action"
            items={allowedActions.map((type) => ({ value: type, label: ACTION_LABELS[type] }))}
            onAdd={(type) =>
              setDef({ ...def, actions: [...def.actions, NEW_ACTION[type as Action['type']]] })
            }
          />
        )}
        <p className="text-[0.8125rem] text-ink-3">
          Placeholders you can use in messages: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(' ')}
        </p>
      </Step>

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {id ? 'Save changes' : 'Create automation'}
        </SubmitButton>
      </div>
    </form>
  );
}

function Step({
  number,
  title,
  hint,
  children,
}: {
  number: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-4 border-t border-rule pt-5 md:grid-cols-[9rem_1fr]">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="font-mono text-xs text-ink-3">{number}</p>
        <p className="font-serif text-2xl">{title}</p>
        {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-ink-3 hover:bg-sunken hover:text-ink"
    >
      <IconClose className="size-4" />
    </button>
  );
}

function AddMenu({
  label,
  items,
  onAdd,
}: {
  label: string;
  items: { value: string; label: string }[];
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={cx(small, 'max-w-64')}
        aria-label={label}
      >
        <option value="">{label}…</option>
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="secondary"
        disabled={!value}
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
      >
        <IconPlus className="size-4" /> Add
      </Button>
    </div>
  );
}

function Checkboxes({
  items,
  selected,
  onChange,
  legend,
}: {
  items: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-pine-700"
              checked={selected.includes(item.id)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, item.id] : selected.filter((s) => s !== item.id))
              }
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ConditionEditor({
  condition,
  options,
  onChange,
}: {
  condition: Condition;
  options: Options;
  onChange: (c: Condition) => void;
}) {
  switch (condition.type) {
    case 'service_is':
      return (
        <Checkboxes
          legend="Services"
          items={options.services.map((s) => ({
            id: s.id,
            label: s.active ? s.name : `${s.name} (inactive)`,
          }))}
          selected={condition.serviceIds}
          onChange={(serviceIds) => onChange({ ...condition, serviceIds })}
        />
      );
    case 'business_hours':
      return (
        <select
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value as 'open' | 'closed' })}
          className={small}
          aria-label="Business hours"
        >
          <option value="closed">closed</option>
          <option value="open">open</option>
        </select>
      );
    case 'customer_is':
      return (
        <select
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value as 'new' | 'returning' })}
          className={small}
          aria-label="Customer type"
        >
          <option value="new">new (no earlier visits)</option>
          <option value="returning">returning</option>
        </select>
      );
    case 'channel_is':
      return (
        <select
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value as 'WEB_CHAT' | 'EMAIL' })}
          className={small}
          aria-label="Channel"
        >
          <option value="WEB_CHAT">web chat</option>
          <option value="EMAIL">email</option>
        </select>
      );
  }
}

function ActionEditor({
  action,
  options,
  onChange,
}: {
  action: Action;
  options: Options;
  onChange: (a: Action) => void;
}) {
  const memberSelect = (
    value: string | null,
    set: (v: string | null) => void,
    allowEmpty: string | null,
    label: string,
  ) => (
    <select
      value={value ?? ''}
      onChange={(e) => set(e.target.value || null)}
      className={small}
      aria-label={label}
    >
      {allowEmpty !== null && <option value="">{allowEmpty}</option>}
      {allowEmpty === null && (
        <option value="" disabled>
          Choose a team member
        </option>
      )}
      {options.members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );

  switch (action.type) {
    case 'send_chat_reply':
      return (
        <textarea
          value={action.message}
          onChange={(e) => onChange({ ...action, message: e.target.value })}
          rows={2}
          maxLength={500}
          placeholder="Message shown in the chat"
          className={cx(controlClasses, 'py-2 text-sm')}
          aria-label="Chat reply"
        />
      );
    case 'email_customer':
      return (
        <div className="space-y-2">
          <input
            value={action.subject}
            onChange={(e) => onChange({ ...action, subject: e.target.value })}
            placeholder="Subject"
            maxLength={150}
            className={small}
            aria-label="Email subject"
          />
          <textarea
            value={action.body}
            onChange={(e) => onChange({ ...action, body: e.target.value })}
            rows={4}
            maxLength={2000}
            placeholder="Email text"
            className={cx(controlClasses, 'py-2 text-sm')}
            aria-label="Email text"
          />
          <p className="text-xs text-ink-3">
            Demo mode: emails go to the outbox under Setup, not to real inboxes.
          </p>
        </div>
      );
    case 'notify_team':
      return (
        <div className="space-y-2">
          <Checkboxes
            legend="Roles"
            items={[
              { id: 'OWNER', label: 'Owners' },
              { id: 'ADMIN', label: 'Admins' },
              { id: 'STAFF', label: 'Staff' },
            ]}
            selected={action.roles}
            onChange={(roles) => onChange({ ...action, roles: roles as typeof action.roles })}
          />
          <Checkboxes
            legend="People"
            items={options.members.map((m) => ({ id: m.id, label: m.name }))}
            selected={action.membershipIds}
            onChange={(membershipIds) => onChange({ ...action, membershipIds })}
          />
          <input
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            placeholder="Notification text"
            maxLength={200}
            className={small}
            aria-label="Notification text"
          />
        </div>
      );
    case 'create_task':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={action.title}
            onChange={(e) => onChange({ ...action, title: e.target.value })}
            placeholder="Task title"
            maxLength={160}
            className={cx(small, 'sm:col-span-2')}
            aria-label="Task title"
          />
          {memberSelect(
            action.assigneeId,
            (assigneeId) => onChange({ ...action, assigneeId }),
            'Anyone on the team',
            'Assignee',
          )}
          <label className="flex items-center gap-2 text-sm text-ink-2">
            Due in
            <input
              type="number"
              min={1}
              max={336}
              value={action.dueInHours ?? ''}
              onChange={(e) =>
                onChange({ ...action, dueInHours: e.target.value ? Number(e.target.value) : null })
              }
              className={cx(small, 'w-20')}
              aria-label="Due in hours"
            />
            hours
          </label>
        </div>
      );
    case 'assign_to':
      return memberSelect(
        action.membershipId,
        (membershipId) => onChange({ ...action, membershipId: membershipId ?? '' }),
        null,
        'Assign to',
      );
    case 'hand_off':
      return (
        <p className="text-sm text-ink-3">
          Relay stops answering and the conversation waits in the inbox for a person.
        </p>
      );
  }
}
