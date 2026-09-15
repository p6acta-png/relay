import { cx } from '@/lib/cx';

/** Form-level feedback. Errors use role="alert" so they are announced immediately. */
export function FormMessage({
  tone,
  children,
  className,
}: {
  tone: 'error' | 'success' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  const styles = {
    error: 'border-danger-600/30 bg-danger-50 text-danger-700',
    success: 'border-pine-600/25 bg-pine-50 text-pine-800',
    info: 'border-info-700/20 bg-info-50 text-info-700',
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-[var(--radius-md)] border px-3 py-2.5 text-sm', styles, className)}
    >
      {children}
    </div>
  );
}

export type BadgeTone = 'neutral' | 'pine' | 'signal' | 'pending' | 'danger' | 'info' | 'outline';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-ink-2',
  pine: 'bg-pine-50 text-pine-700',
  signal: 'bg-signal-50 text-signal-700',
  pending: 'bg-pending-50 text-pending-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-700',
  outline: 'border border-rule-strong text-ink-2',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-xs font-medium whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-rule-strong px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-ink-3">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-rule pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[1.625rem] leading-tight font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Shown instead of a page section when the member's role does not allow it. */
export function AccessNotice({ what }: { what: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="eyebrow">403 · Not available for your role</p>
      <h1 className="mt-3 text-xl font-semibold">You don’t have access to {what}</h1>
      <p className="mt-2 text-sm text-ink-2">
        Ask an owner or admin of this business if you need it. Relay checks this on the server, so the page
        stays closed even if the link is shared.
      </p>
    </div>
  );
}

/** Marks simulated integrations so demo behaviour is never mistaken for a real one. */
export function DemoModeTag({ children = 'Demo mode' }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-signal-500/60 bg-signal-50 px-1.5 font-mono text-[0.6875rem] tracking-wide text-signal-700 uppercase">
      {children}
    </span>
  );
}
