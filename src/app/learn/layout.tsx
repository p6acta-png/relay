import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { RelayWordmark } from '@/components/brand/logo';
import { SUBSYSTEM_GROUPS, SUBSYSTEMS } from '@/content/learn/subsystems';
import { WALKTHROUGHS } from '@/content/learn/walkthroughs';
import { LearnNav, type LearnNavSection } from './_components/learn-nav';
import { LearnModeProvider, ModeToggle } from './_components/mode';
import { LEARN_MODE_COOKIE, type LearnMode } from './_components/mode-shared';

export const metadata: Metadata = {
  title: { default: 'How Relay works', template: '%s · How Relay works' },
  description:
    'A guided tour of Relay’s codebase: architecture, subsystems, walkthroughs and interview preparation.',
};

const SECTIONS: LearnNavSection[] = [
  {
    label: 'Start here',
    items: [
      { href: '/learn', label: 'Overview' },
      { href: '/learn/architecture', label: 'Architecture explorer' },
      { href: '/learn/concepts', label: 'Concepts' },
      { href: '/learn/simulations', label: 'What is simulated' },
      { href: '/learn/interview', label: 'Interview preparation' },
    ],
  },
  {
    label: 'Walkthroughs',
    items: WALKTHROUGHS.map((w) => ({ href: `/learn/walkthroughs/${w.slug}`, label: w.title })),
  },
  ...SUBSYSTEM_GROUPS.map(({ group }) => ({
    label: group,
    items: SUBSYSTEMS.filter((s) => s.group === group).map((s) => ({
      href: `/learn/subsystems/${s.slug}`,
      label: s.title,
    })),
  })),
];

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const stored = (await cookies()).get(LEARN_MODE_COOKIE)?.value;
  const mode: LearnMode = stored === 'developer' ? 'developer' : 'beginner';

  return (
    <LearnModeProvider initial={mode}>
      <a
        href="#learn-main"
        className="sr-only-focusable fixed top-2 left-2 z-50 rounded bg-ink px-3 py-2 text-sm text-white"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-5 sm:px-8">
          <Link href="/" className="shrink-0" aria-label="Relay home">
            <RelayWordmark />
          </Link>
          <span aria-hidden className="hidden h-5 w-px bg-rule-strong sm:block" />
          <Link
            href="/learn"
            className="hidden font-serif text-[1.0625rem] italic text-ink-2 hover:text-ink sm:block"
          >
            How Relay works
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-ink-3 md:inline">Explain it for a</span>
            <ModeToggle />
            <Link
              href="/app"
              className="hidden h-8 items-center rounded-[var(--radius-md)] border border-rule-strong px-3 text-[0.8125rem] text-ink-2 hover:border-ink-3 hover:text-ink md:inline-flex"
            >
              Open the dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12 lg:py-12">
        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pb-8">
          <LearnNav sections={SECTIONS} />
        </aside>
        <main id="learn-main" className="min-w-0">
          {children}
        </main>
      </div>
    </LearnModeProvider>
  );
}
