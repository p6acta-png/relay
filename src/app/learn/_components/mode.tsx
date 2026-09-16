'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { cx } from '@/lib/cx';
import { LEARN_MODE_COOKIE, type LearnMode } from './mode-shared';

/**
 * Beginner / Developer reading mode for /learn.
 * Stored in a cookie so the server renders the right mode first (no flash), and switched
 * instantly on the client.
 */

const ModeContext = createContext<{ mode: LearnMode; setMode: (mode: LearnMode) => void }>({
  mode: 'beginner',
  setMode: () => {},
});

export function LearnModeProvider({ initial, children }: { initial: LearnMode; children: React.ReactNode }) {
  const [mode, setModeState] = useState(initial);
  const setMode = useCallback((next: LearnMode) => {
    setModeState(next);
    document.cookie = `${LEARN_MODE_COOKIE}=${next}; path=/learn; max-age=31536000; samesite=lax`;
  }, []);
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useLearnMode = () => useContext(ModeContext);

export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useLearnMode();
  return (
    <div
      role="group"
      aria-label="Reading mode"
      className={cx(
        'inline-flex rounded-[var(--radius-md)] border border-rule-strong bg-surface p-0.5',
        className,
      )}
    >
      {(['beginner', 'developer'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => setMode(option)}
          className={cx(
            'h-7 rounded-[3px] px-2.5 text-[0.8125rem] capitalize transition-colors',
            mode === option ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Renders the child for the current mode. Both are server-rendered; only one is shown. */
export function ByMode({ beginner, developer }: { beginner: React.ReactNode; developer: React.ReactNode }) {
  const { mode } = useLearnMode();
  return <>{mode === 'beginner' ? beginner : developer}</>;
}

/** A <details> that starts open in developer mode and closed in beginner mode. */
export function ModeDetails({
  summary,
  children,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { mode } = useLearnMode();
  // Re-mount when the mode changes, so switching mode resets open/closed as expected.
  return (
    <details key={mode} open={mode === 'developer'} className={cx('group', className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block w-3 text-ink-3 transition-transform group-open:rotate-90">
          ›
        </span>
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function ModeBadge({ for: target }: { for: LearnMode }) {
  const { mode } = useLearnMode();
  if (mode !== target) return null;
  return (
    <span className="ml-2 rounded-[var(--radius-sm)] bg-signal-50 px-1.5 py-0.5 align-middle font-mono text-[0.625rem] tracking-wide text-signal-700 uppercase">
      Start here
    </span>
  );
}
