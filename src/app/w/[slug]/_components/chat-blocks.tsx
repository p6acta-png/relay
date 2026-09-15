'use client';

import { useId, useState } from 'react';
import { IconCheck, IconClock, IconLedger } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import type { ReplyBlock } from '@/modules/conversations/model';
import { useChat } from './chat-provider';

/**
 * Structured UI under an assistant message. Only the newest assistant message is interactive:
 * older buttons stay visible for context but can no longer be pressed.
 */
export function ChatBlocks({ blocks, interactive }: { blocks: ReplyBlock[]; interactive: boolean }) {
  return (
    <div className="mt-2.5 space-y-2.5">
      {blocks.map((block, index) => (
        <Block key={index} block={block} interactive={interactive} />
      ))}
    </div>
  );
}

const choiceButton =
  'rounded-[var(--radius-md)] border border-rule-strong bg-white text-sm text-ink transition-colors hover:border-pine-600 hover:bg-pine-50 ' +
  'disabled:cursor-default disabled:border-rule disabled:bg-transparent disabled:text-ink-3';

function Block({ block, interactive }: { block: ReplyBlock; interactive: boolean }) {
  const { send, manageUrl } = useChat();

  switch (block.type) {
    case 'quick_replies':
      return (
        <div className="flex flex-wrap gap-1.5">
          {block.options.map((option) => (
            <button
              key={option.label}
              type="button"
              disabled={!interactive}
              onClick={() =>
                send(option.input, option.input.kind === 'text' ? option.input.text : option.label)
              }
              className={cx(
                choiceButton,
                'px-3 py-1.5',
                // The one step that commits something gets the primary style.
                option.input.kind === 'confirm_booking' &&
                  'border-pine-700 bg-pine-700 font-medium text-white hover:border-pine-800 hover:bg-pine-800',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      );

    case 'service_options':
      return (
        <ul className="divide-y divide-rule overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-white">
          {block.services.map((service) => (
            <li key={service.id}>
              <button
                type="button"
                disabled={!interactive}
                onClick={() => send({ kind: 'choose_service', serviceId: service.id }, service.name)}
                className="flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-pine-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="text-sm font-medium text-ink">{service.name}</span>
                <span
                  className={cx(
                    'shrink-0 font-mono text-[0.6875rem]',
                    service.quote ? 'text-signal-700' : 'text-ink-3',
                  )}
                >
                  {service.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      );

    case 'slot_options':
      return (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-rule bg-white p-3">
          {block.days.map((day) => (
            <div key={day.label}>
              <p className="eyebrow mb-1.5">{day.label}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {day.slots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!interactive}
                    onClick={() =>
                      send({ kind: 'choose_slot', slotId: slot.id }, `${day.label} at ${slot.time}`)
                    }
                    className={cx(choiceButton, 'tabular py-2 font-mono text-[0.8125rem]')}
                    aria-label={`${day.label} at ${slot.time}`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {block.canShowMore && (
            <button
              type="button"
              disabled={!interactive}
              onClick={() => send({ kind: 'more_times' }, 'Show me more times')}
              className="text-xs font-medium text-pine-700 underline underline-offset-2 disabled:text-ink-3 disabled:no-underline"
            >
              Show later times
            </button>
          )}
        </div>
      );

    case 'details_form':
      return <DetailsForm block={block} interactive={interactive} />;

    case 'booking_summary':
      return (
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 rounded-[var(--radius-lg)] border border-rule bg-white p-3.5 text-sm">
          <dt className="text-ink-3">Service</dt>
          <dd className="font-medium">{block.service}</dd>
          <dt className="text-ink-3">When</dt>
          <dd>{block.when}</dd>
          {block.price && (
            <>
              <dt className="text-ink-3">Price</dt>
              <dd className="tabular">{block.price}</dd>
            </>
          )}
          <dt className="text-ink-3">For</dt>
          <dd className="break-words">{block.contact}</dd>
          {block.needsApproval && (
            <dd className="col-span-2 mt-1 text-xs text-pending-700">
              The workshop confirms this booking personally.
            </dd>
          )}
        </dl>
      );

    case 'booking_result':
      return (
        <div
          className={cx(
            'rounded-[var(--radius-lg)] border p-3.5',
            block.status === 'CONFIRMED'
              ? 'border-pine-600/30 bg-pine-50'
              : 'border-pending-700/25 bg-pending-50',
          )}
        >
          <p
            className={cx(
              'flex items-center gap-1.5 text-sm font-semibold',
              block.status === 'CONFIRMED' ? 'text-pine-800' : 'text-pending-700',
            )}
          >
            {block.status === 'CONFIRMED' ? (
              <IconCheck className="size-4" />
            ) : (
              <IconClock className="size-4" />
            )}
            {block.status === 'CONFIRMED' ? 'Booked' : 'Request sent'}
          </p>
          <p className="mt-1.5 text-sm text-ink">
            {block.service} · {block.when}
          </p>
          <p className="mt-2 font-mono text-xs text-ink-2">
            Reference <span className="text-sm font-medium text-ink">{block.reference}</span>
          </p>
          {manageUrl && interactive && (
            <a
              href={manageUrl}
              className="mt-2 inline-block text-xs font-medium text-pine-700 underline underline-offset-2"
            >
              Change or cancel this booking
            </a>
          )}
        </div>
      );

    case 'source':
      return (
        <p className="flex items-center gap-1.5 text-[0.6875rem] text-ink-3">
          <IconLedger className="size-3.5" />
          {block.label}
        </p>
      );

    case 'handoff_notice':
      return (
        <p className="rounded-[var(--radius-md)] border border-signal-500/30 bg-signal-50 px-3 py-2 text-xs text-signal-700">
          A person from the team will reply here, usually within {block.replyWithinHours} hours.
        </p>
      );
  }
}

function DetailsForm({
  block,
  interactive,
}: {
  block: Extract<ReplyBlock, { type: 'details_form' }>;
  interactive: boolean;
}) {
  const { send } = useChat();
  const id = useId();
  const [values, setValues] = useState({
    name: block.prefill.name ?? '',
    email: block.prefill.email ?? '',
    phone: block.prefill.phone ?? '',
  });
  const errors = block.errors ?? {};
  const submitLabel = { booking: 'Continue', quote: 'Send request', handoff: 'Send' }[block.purpose];

  const field = (
    name: 'name' | 'email' | 'phone',
    label: string,
    type: string,
    autoComplete: string,
    optional = false,
  ) => (
    <div>
      <label htmlFor={`${id}-${name}`} className="mb-1 flex justify-between text-xs font-medium text-ink-2">
        {label}
        {optional && <span className="font-normal text-ink-3">Optional</span>}
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={values[name]}
        disabled={!interactive}
        onChange={(event) => setValues((v) => ({ ...v, [name]: event.target.value }))}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
        className="h-9 w-full rounded-[var(--radius-md)] border border-rule-strong bg-white px-2.5 text-sm focus:border-pine-600 focus:ring-2 focus:ring-pine-600/20 focus:outline-none disabled:bg-sunken disabled:text-ink-3 aria-[invalid=true]:border-danger-600"
      />
      {errors[name] && (
        <p id={`${id}-${name}-error`} className="mt-1 text-xs text-danger-700">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form
      className="space-y-2.5 rounded-[var(--radius-lg)] border border-rule bg-white p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (interactive) void send({ kind: 'submit_details', ...values }, 'Shared contact details');
      }}
      aria-label={block.purpose === 'booking' ? 'Your details for the booking' : 'Your contact details'}
    >
      {field('name', 'Name', 'text', 'name')}
      {field('email', 'Email', 'email', 'email')}
      {block.purpose !== 'handoff' && field('phone', 'Phone', 'tel', 'tel', true)}
      <button
        type="submit"
        disabled={!interactive}
        className="h-9 w-full rounded-[var(--radius-md)] bg-pine-700 text-sm font-medium text-white hover:bg-pine-800 disabled:bg-sunken disabled:text-ink-3"
      >
        {submitLabel}
      </button>
      <p className="text-[0.6875rem] leading-snug text-ink-3">Used only to handle this request.</p>
    </form>
  );
}
