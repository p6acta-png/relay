import { cx } from '@/lib/cx';

/**
 * The Relay mark: two bars handing over — the customer's request (ink) passed on as a
 * structured action (signal orange).
 */
export function RelayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-6', className)} aria-hidden focusable="false">
      <rect x="2" y="6" width="13" height="4" rx="1" className="fill-ink" />
      <rect x="9" y="14" width="13" height="4" rx="1" className="fill-signal-500" />
    </svg>
  );
}

export function RelayWordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-semibold tracking-tight text-ink', className)}>
      <RelayMark />
      <span className="text-[1.0625rem]">Relay</span>
    </span>
  );
}
