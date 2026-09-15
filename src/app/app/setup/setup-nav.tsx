'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';

const LINKS = [
  { href: '/app/setup/business', label: 'Business & rules' },
  { href: '/app/setup/services', label: 'Services' },
  { href: '/app/setup/staff', label: 'Staff & hours' },
  { href: '/app/setup/time-off', label: 'Time off' },
  { href: '/app/setup/knowledge', label: 'Knowledge' },
  { href: '/app/setup/team', label: 'Team' },
  { href: '/app/setup/outbox', label: 'Email outbox', outbox: true },
];

export function SetupNav({ showOutbox }: { showOutbox: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Setup sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-rule">
      {LINKS.filter((l) => !l.outbox || showOutbox).map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap',
              active ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
