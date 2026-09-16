import Link from 'next/link';
import type { BookingStatus, ConversationStatus, LeadStatus, TaskStatus } from '@/generated/prisma/enums';
import { Badge, type BadgeTone } from '@/components/ui/misc';
import { cx } from '@/lib/cx';

const BOOKING: Record<BookingStatus, [string, BadgeTone]> = {
  CONFIRMED: ['Confirmed', 'pine'],
  PENDING: ['Needs approval', 'pending'],
  CANCELLED: ['Cancelled', 'neutral'],
  DECLINED: ['Declined', 'danger'],
};
const CONVERSATION: Record<ConversationStatus, [string, BadgeTone]> = {
  NEEDS_HUMAN: ['Needs a person', 'signal'],
  OPEN: ['Open', 'info'],
  RESOLVED: ['Resolved', 'neutral'],
};
const LEAD: Record<LeadStatus, [string, BadgeTone]> = {
  NEW: ['New', 'signal'],
  CONTACTED: ['Contacted', 'info'],
  WON: ['Won', 'pine'],
  LOST: ['Lost', 'neutral'],
};
const TASK: Record<TaskStatus, [string, BadgeTone]> = {
  OPEN: ['Open', 'info'],
  DONE: ['Done', 'neutral'],
};

export const BookingStatusBadge = ({ status }: { status: BookingStatus }) => (
  <Badge tone={BOOKING[status][1]} dot>
    {BOOKING[status][0]}
  </Badge>
);
export const ConversationStatusBadge = ({ status }: { status: ConversationStatus }) => (
  <Badge tone={CONVERSATION[status][1]} dot>
    {CONVERSATION[status][0]}
  </Badge>
);
export const LeadStatusBadge = ({ status }: { status: LeadStatus }) => (
  <Badge tone={LEAD[status][1]} dot>
    {LEAD[status][0]}
  </Badge>
);
export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => (
  <Badge tone={TASK[status][1]}>{TASK[status][0]}</Badge>
);

export const LEAD_STATUS_LABELS = Object.fromEntries(
  Object.entries(LEAD).map(([k, v]) => [k, v[0]]),
) as Record<LeadStatus, string>;

/** Filter tabs rendered as links, so filters are shareable URLs and work without JavaScript. */
export function FilterTabs({
  tabs,
  label,
}: {
  label: string;
  tabs: { href: string; label: string; count?: number; active: boolean; urgent?: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 border-b border-rule">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={cx(
            '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
            tab.active ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span
              className={cx(
                'tabular rounded-[var(--radius-sm)] px-1.5 font-mono text-[0.6875rem] leading-5',
                tab.urgent ? 'bg-signal-700 text-white' : 'bg-sunken text-ink-2',
              )}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function SectionHeading({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        {children && <p className="mt-0.5 text-sm text-ink-3">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-[var(--radius-lg)] border border-rule bg-surface', className)}>
      {children}
    </div>
  );
}

export const tableClasses = {
  table: 'w-full text-left text-sm',
  th: 'eyebrow border-b border-rule px-3 py-2.5 font-normal whitespace-nowrap',
  td: 'border-b border-rule/70 px-3 py-3 align-top',
  row: 'hover:bg-sunken/40',
};

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className={cx(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-ink-2',
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}
