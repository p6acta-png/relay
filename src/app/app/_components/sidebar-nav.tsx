'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBolt,
  IconCalendar,
  IconChart,
  IconInbox,
  IconLead,
  IconLedger,
  IconSliders,
  IconTask,
  IconToday,
  IconUsers,
} from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import type { NavCountKey, NavIcon, NavItem } from './nav-config';

const ICONS: Record<NavIcon, (p: { className?: string }) => React.ReactNode> = {
  today: IconToday,
  inbox: IconInbox,
  bookings: IconCalendar,
  leads: IconLead,
  tasks: IconTask,
  customers: IconUsers,
  automations: IconBolt,
  analytics: IconChart,
  audit: IconLedger,
  setup: IconSliders,
};

export function SidebarNav({
  groups,
  counts,
  onNavigate,
}: {
  groups: { label: string; items: NavItem[] }[];
  counts: Record<NavCountKey, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="eyebrow px-3 pb-1.5">{group.label}</p>
          <ul className="space-y-px">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const count = item.count ? counts[item.count] : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'group relative flex h-9 items-center gap-2.5 rounded-[var(--radius-md)] px-3 text-sm transition-colors',
                      active
                        ? 'bg-sunken font-medium text-ink'
                        : 'text-ink-2 hover:bg-sunken/60 hover:text-ink',
                    )}
                  >
                    {active && (
                      <span
                        className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r bg-pine-700"
                        aria-hidden
                      />
                    )}
                    <Icon className={active ? 'text-pine-700' : 'text-ink-3 group-hover:text-ink-2'} />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span
                        className={cx(
                          'tabular min-w-5 rounded-[var(--radius-sm)] px-1.5 text-center font-mono text-[0.6875rem] leading-5',
                          item.count === 'needsHuman' ? 'bg-signal-500 text-white' : 'bg-ink/8 text-ink-2',
                        )}
                      >
                        {count}
                        <span className="sr-only">
                          {item.count === 'needsHuman' ? ' waiting for a person' : ' waiting'}
                        </span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
