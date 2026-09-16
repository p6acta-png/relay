import type { Metadata } from 'next';
import Link from 'next/link';
import { CONCEPTS } from '@/content/learn/concepts';
import { getSubsystem } from '@/content/learn/subsystems';
import { ByMode } from '../_components/mode';
import { RichText } from '../_components/rich-text';

export const metadata: Metadata = {
  title: 'Concepts',
  description: 'Ideas the Relay codebase relies on, explained from the ground up.',
};

export default function ConceptsPage() {
  return (
    <div className="max-w-3xl">
      <header>
        <p className="eyebrow">Glossary</p>
        <h1 className="mt-3 font-serif text-[2.5rem] leading-[1.08] tracking-tight">Concepts</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          The ideas behind the code, each in one short explanation. Switch between Beginner and Developer at
          the top.
        </p>
      </header>

      <nav
        aria-label="Concepts on this page"
        className="mt-6 flex flex-wrap gap-x-3 gap-y-1.5 text-[0.8125rem]"
      >
        {CONCEPTS.map((c) => (
          <a key={c.slug} href={`#${c.slug}`} className="text-ink-2 hover:text-ink">
            {c.term}
          </a>
        ))}
      </nav>

      <dl className="mt-10 divide-y divide-rule border-y border-rule">
        {CONCEPTS.map((concept) => (
          <div
            key={concept.slug}
            id={concept.slug}
            className="grid scroll-mt-24 gap-2 py-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8"
          >
            <dt className="font-serif text-[1.25rem] leading-snug">{concept.term}</dt>
            <dd>
              <p className="leading-[1.7]">
                <ByMode
                  beginner={<RichText text={concept.beginner} />}
                  developer={<RichText text={concept.developer} />}
                />
              </p>
              {concept.seeAlso.length > 0 && (
                <p className="mt-2 text-[0.8125rem] text-ink-3">
                  In Relay:{' '}
                  {concept.seeAlso.map((slug, i) => (
                    <span key={slug}>
                      {i > 0 && ', '}
                      <Link
                        href={`/learn/subsystems/${slug}`}
                        className="text-pine-700 underline underline-offset-2"
                      >
                        {getSubsystem(slug)?.title}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
