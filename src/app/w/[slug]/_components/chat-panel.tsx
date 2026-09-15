'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconClose, IconHandoff, IconSend } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { MAX_MESSAGE_LENGTH } from '@/modules/conversations/model';
import { ChatBlocks } from './chat-blocks';
import { useChat, type ChatMessage } from './chat-provider';

export function ChatPanel() {
  const chat = useChat();
  const { isOpen, close } = chat;
  const titleId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');

  // Focus the composer when the panel opens; Escape closes it.
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => composerRef.current?.focus(), 50);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.messages, chat.isOpen]);

  // Grow the composer with its content, up to a few lines.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  if (!chat.isOpen) return null;

  // Everything Relay said since the customer's last message stays usable (an automation may add a
  // note after the slot buttons); anything older is kept for context but can't be pressed again.
  const lastCustomerIndex = chat.messages.findLastIndex((m) => m.author === 'CUSTOMER');

  const submit = () => {
    const text = draft.trim();
    if (!text || chat.sending) return;
    setDraft('');
    void chat.send({ kind: 'text', text }, text);
  };

  return (
    <aside
      aria-labelledby={titleId}
      className="fixed inset-0 z-40 flex flex-col bg-surface sm:inset-auto sm:top-0 sm:right-0 sm:bottom-0 sm:w-[27rem] sm:border-l sm:border-rule sm:shadow-[var(--shadow-pop)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate font-semibold">
            {chat.businessName}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            {chat.assistantActive ? (
              <>
                <span className="size-1.5 rounded-full bg-pine-500" aria-hidden />
                Automated assistant · replies right away
              </>
            ) : (
              <>
                <IconHandoff className="size-3.5 text-signal-700" />
                With the team · a person will reply here
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={chat.close}
          className="-mt-1 -mr-2 inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] text-ink-2 hover:bg-sunken"
          aria-label="Close chat"
        >
          <IconClose />
        </button>
      </header>

      <ol
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {chat.messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            interactive={index > lastCustomerIndex && !chat.sending}
            timeZone={chat.timeZone}
          />
        ))}
        {chat.sending && (
          <li className="flex items-center gap-1.5 text-xs text-ink-3" aria-label="Relay is replying">
            <span className="size-1.5 animate-pulse rounded-full bg-ink-3" />
            <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:300ms]" />
          </li>
        )}
      </ol>

      {chat.notice && (
        <p
          role="status"
          className="mx-5 mb-2 rounded-[var(--radius-md)] bg-info-50 px-3 py-2 text-sm text-info-700"
        >
          {chat.notice}
        </p>
      )}

      <form
        className="border-t border-rule bg-surface px-4 pt-3 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-composer" className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2 rounded-[var(--radius-lg)] border border-rule-strong bg-white p-1.5 focus-within:border-pine-600 focus-within:ring-2 focus-within:ring-pine-600/20">
          <textarea
            id="chat-composer"
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Ask a question or tell us what you need…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] leading-snug placeholder:text-ink-3/80 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || chat.sending}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-pine-700 text-white hover:bg-pine-800 disabled:bg-sunken disabled:text-ink-3"
            aria-label="Send message"
          >
            <IconSend className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[0.6875rem] text-ink-3">
          <span>Automated replies. Messages are stored so the team can follow up.</span>
          {draft.length > MAX_MESSAGE_LENGTH - 200 && (
            <span className="tabular font-mono">
              {draft.length}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
        </div>
        {chat.messages.length > 3 && (
          <button
            type="button"
            onClick={chat.restart}
            className="mt-1 text-[0.6875rem] text-ink-3 underline hover:text-ink"
          >
            Start a new conversation
          </button>
        )}
      </form>
    </aside>
  );
}

function MessageItem({
  message,
  interactive,
  timeZone,
}: {
  message: ChatMessage;
  interactive: boolean;
  timeZone: string;
}) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(message.createdAt),
  );

  if (message.author === 'CUSTOMER') {
    return (
      <li className="flex flex-col items-end">
        <div
          className={cx(
            'max-w-[85%] rounded-[var(--radius-lg)] rounded-br-[3px] px-3.5 py-2 text-[0.9375rem] leading-snug whitespace-pre-wrap',
            message.failed ? 'bg-danger-50 text-danger-700' : 'bg-pine-700 text-white',
            message.pending && 'opacity-70',
          )}
        >
          {message.body}
        </div>
        <span className="mt-1 font-mono text-[0.625rem] text-ink-3">
          {message.failed ? message.failed : message.pending ? 'Sending…' : `You · ${time}`}
        </span>
      </li>
    );
  }

  const isStaff = message.author === 'STAFF';
  return (
    <li className={cx('max-w-[92%]', isStaff && 'border-l-2 border-signal-500 pl-3')}>
      <p className="mb-1 font-mono text-[0.625rem] tracking-wide text-ink-3 uppercase">
        {isStaff ? `${message.authorName ?? 'Staff'} · ${time}` : `Relay · ${time}`}
      </p>
      <div className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink">{message.body}</div>
      {message.blocks.length > 0 && <ChatBlocks blocks={message.blocks} interactive={interactive} />}
    </li>
  );
}
