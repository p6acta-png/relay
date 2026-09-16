'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { IconBell } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { markNotificationsReadAction } from './actions';

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  href: string | null;
  createdLabel: string;
  unread: boolean;
}

export function NotificationsMenu({ items, unread }: { items: NotificationView[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="notifications-panel"
        className="relative inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] text-ink-2 hover:bg-sunken hover:text-ink"
      >
        <IconBell />
        <span className="sr-only">Notifications{unread > 0 ? `, ${unread} unread` : ''}</span>
        {unread > 0 && (
          <span
            className="tabular absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-700 px-1 font-mono text-[0.625rem] text-white"
            aria-hidden
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notifications-panel"
          className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-surface shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => markNotificationsReadAction())}
                className="text-xs font-medium text-pine-700 hover:underline disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-3">
              Nothing new. Relay will let you know when a customer needs a person.
            </p>
          ) : (
            <ul className="max-h-[24rem] divide-y divide-rule overflow-y-auto">
              {items.map((item) => {
                const content = (
                  <>
                    <span className="flex items-start gap-2">
                      <span
                        className={cx(
                          'mt-1.5 size-1.5 shrink-0 rounded-full',
                          item.unread ? 'bg-signal-500' : 'bg-transparent',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cx('block text-sm', item.unread ? 'font-medium text-ink' : 'text-ink-2')}
                        >
                          {item.title}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 block text-[0.8125rem] text-ink-3">{item.body}</span>
                        )}
                        <span className="mt-1 block font-mono text-[0.6875rem] text-ink-3">
                          {item.createdLabel}
                        </span>
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-3 hover:bg-sunken/60"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
