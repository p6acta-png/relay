import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSubsystem } from '@/content/learn/subsystems';
import { getWalkthrough, WALKTHROUGHS } from '@/content/learn/walkthroughs';
import { CodeExcerpt } from '../../_components/code-excerpt';
import { ByMode, ModeDetails } from '../../_components/mode';
import { RichText } from '../../_components/rich-text';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return WALKTHROUGHS.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const walkthrough = getWalkthrough((await params).slug);
  return walkthrough
    ? { title: walkthrough.title, description: walkthrough.summary }
    : { title: 'Not found' };
}

export default async function WalkthroughPage({ params }: Props) {
  const walkthrough = getWalkthrough((await params).slug);
  if (!walkthrough) notFound();

  return (
    <article className="max-w-3xl">
      <header>
        <p className="eyebrow">Walkthrough · {walkthrough.steps.length} steps</p>
        <h1 className="mt-3 font-serif text-[2.5rem] leading-[1.08] tracking-tight">{walkthrough.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{walkthrough.summary}</p>
      </header>

      <section
        aria-labelledby="try-title"
        className="mt-8 rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
      >
        <h2 id="try-title" className="eyebrow">
          Try it in the app
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[0.9375rem] text-ink-2 marker:font-mono marker:text-ink-3">
          {walkthrough.tryIt.map((line) => (
            <li key={line}>
              <RichText text={line} />
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-ink-3">Demo password for every account: relay-demo-2026</p>
      </section>

      <p className="mt-8 text-sm text-ink-3">
        <ByMode
          beginner="You are reading the beginner version. Switch to Developer at the top for function names and details."
          developer="You are reading the developer version. Code excerpts open automatically."
        />
      </p>

      <ol className="mt-6">
        {walkthrough.steps.map((step, index) => (
          <li
            key={step.title}
            className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 pb-10 last:pb-0"
          >
            {index < walkthrough.steps.length - 1 && (
              <span aria-hidden className="absolute top-9 bottom-0 left-[1.0625rem] w-px bg-rule-strong" />
            )}
            <span
              aria-hidden
              className="relative flex size-9 items-center justify-center rounded-full border border-ink bg-paper font-mono text-[0.8125rem]"
            >
              {index + 1}
            </span>
            <div className="min-w-0 pt-1">
              <h2 className="text-[1.125rem] font-semibold">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h2>
              <p className="mt-2 leading-[1.7]">
                <ByMode
                  beginner={<RichText text={step.beginner} />}
                  developer={<RichText text={step.developer} />}
                />
              </p>
              {step.ref && (
                <ModeDetails summary="Show the code for this step" className="mt-4">
                  <CodeExcerpt codeRef={step.ref} title={step.title} />
                </ModeDetails>
              )}
            </div>
          </li>
        ))}
      </ol>

      <section aria-labelledby="deeper-title" className="mt-12 border-t border-rule pt-8">
        <h2 id="deeper-title" className="eyebrow">
          Go deeper
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {walkthrough.related.map((slug) => (
            <li key={slug}>
              <Link
                href={`/learn/subsystems/${slug}`}
                className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-rule-strong bg-surface px-3 text-[0.8125rem] hover:border-ink-3"
              >
                {getSubsystem(slug)?.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
