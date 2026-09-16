'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cx } from '@/lib/cx';

export interface LearnNavSection {
  label: string;
  items: { href: string; label: string }[];
}

function NavList({ sections, onNavigate }: { sections: LearnNavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="eyebrow pb-1.5">{section.label}</p>
          <ul className="space-y-px border-l border-rule">
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      '-ml-px block border-l py-1 pr-2 pl-3 text-[0.875rem] leading-snug transition-colors',
                      active
                        ? 'border-ink font-medium text-ink'
                        : 'border-transparent text-ink-2 hover:border-rule-strong hover:text-ink',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function LearnNav({ sections }: { sections: LearnNavSection[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Learn" className="hidden lg:block">
        <NavList sections={sections} />
      </nav>
      <div className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="learn-mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-full items-center justify-between rounded-[var(--radius-md)] border border-rule-strong bg-surface px-3 text-sm"
        >
          Contents
          <span aria-hidden>{open ? '−' : '+'}</span>
        </button>
        {open && (
          <nav
            id="learn-mobile-nav"
            aria-label="Learn"
            className="mt-3 rounded-[var(--radius-lg)] border border-rule bg-surface p-4"
          >
            <NavList sections={sections} onNavigate={() => setOpen(false)} />
          </nav>
        )}
      </div>
    </>
  );
}
