import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSubsystem, SUBSYSTEMS } from '@/content/learn/subsystems';
import { CodeExcerpt } from '../../_components/code-excerpt';
import { ModeBadge, ModeDetails } from '../../_components/mode';
import { Paragraphs, RichText } from '../../_components/rich-text';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return SUBSYSTEMS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const subsystem = getSubsystem((await params).slug);
  return subsystem ? { title: subsystem.title, description: subsystem.summary } : { title: 'Not found' };
}

const SECTIONS = [
  ['beginner', 'Explained simply'],
  ['professional', 'For developers'],
  ['why', 'Why this approach'],
  ['where', 'Where it lives'],
  ['failures', 'What can fail'],
  ['interview', 'What to say in an interview'],
  ['follow-up', 'A likely follow-up question'],
] as const;

function Section({
  id,
  number,
  title,
  children,
  aside,
}: {
  id: string;
  number: number;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-rule pt-8">
      <p className="eyebrow">{String(number).padStart(2, '0')}</p>
      <h2 id={`${id}-title`} className="mt-1 text-[1.3125rem] font-semibold">
        {title}
        {aside}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SubsystemPage({ params }: Props) {
  const subsystem = getSubsystem((await params).slug);
  if (!subsystem) notFound();
  const index = SUBSYSTEMS.indexOf(subsystem);
  const previous = SUBSYSTEMS[index - 1];
  const next = SUBSYSTEMS[index + 1];

  return (
    <article className="max-w-3xl">
      <header>
        <p className="eyebrow">Subsystem · {subsystem.group}</p>
        <h1 className="mt-3 font-serif text-[2.5rem] leading-[1.08] tracking-tight">{subsystem.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{subsystem.summary}</p>
        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem]">
          {SECTIONS.map(([id, label], i) => (
            <a key={id} href={`#${id}`} className="text-ink-2 hover:text-ink">
              <span className="font-mono text-ink-3">{String(i + 1).padStart(2, '0')}</span> {label}
            </a>
          ))}
          {subsystem.snippets.length > 0 && (
            <a href="#code" className="text-ink-2 hover:text-ink">
              Code
            </a>
          )}
          {subsystem.tests.length > 0 && (
            <a href="#tests" className="text-ink-2 hover:text-ink">
              Tests
            </a>
          )}
        </nav>
      </header>

      <div className="mt-10 space-y-10 text-[1rem] leading-[1.7] text-ink">
        <Section id="beginner" number={1} title="Explained simply" aside={<ModeBadge for="beginner" />}>
          <Paragraphs items={subsystem.beginner} />
        </Section>

        <Section id="professional" number={2} title="For developers" aside={<ModeBadge for="developer" />}>
          <Paragraphs items={subsystem.professional} />
        </Section>

        <Section id="why" number={3} title="Why this approach">
          <div className="space-y-5">
            {subsystem.why.map((w) => (
              <div key={w.decision} className="border-l-2 border-pine-600 pl-4">
                <p className="font-medium">
                  <RichText text={w.decision} />
                </p>
                <p className="mt-1 text-ink-2">
                  <RichText text={w.because} />
                </p>
                <p className="mt-1.5 text-[0.875rem] text-ink-3">
                  <span className="font-medium text-ink-2">Instead of:</span> <RichText text={w.instead} />
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="where" number={4} title="Where it lives">
          <ul className="divide-y divide-rule rounded-[var(--radius-lg)] border border-rule bg-surface text-[0.9375rem]">
            {subsystem.files.map((file) => (
              <li
                key={file.path}
                className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
              >
                <code className="font-mono text-[0.8125rem] break-all text-ink">{file.path}</code>
                <span className="text-ink-2">
                  <RichText text={file.role} />
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="failures" number={5} title="What can fail">
          <dl className="space-y-4">
            {subsystem.failures.map((f) => (
              <div
                key={f.what}
                className="rounded-[var(--radius-lg)] border border-rule bg-surface px-4 py-3"
              >
                <dt className="font-medium">
                  <RichText text={f.what} />
                </dt>
                <dd className="mt-1 text-ink-2">
                  <RichText text={f.handling} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="interview" number={6} title="What to say in an interview">
          <blockquote className="border-l-4 border-signal-500 bg-surface py-4 pr-4 pl-5 font-serif text-[1.125rem] leading-relaxed">
            <Paragraphs items={subsystem.interview} className="space-y-3" />
          </blockquote>
        </Section>

        <Section id="follow-up" number={7} title="A likely follow-up question">
          <p className="font-serif text-[1.25rem] leading-snug italic">“{subsystem.followUp.question}”</p>
          <ModeDetails summary="A good answer" className="mt-4">
            <Paragraphs items={subsystem.followUp.answer} className="space-y-3 text-ink-2" />
          </ModeDetails>
        </Section>

        {subsystem.snippets.length > 0 && (
          <section id="code" aria-labelledby="code-title" className="scroll-mt-24 border-t border-rule pt-8">
            <p className="eyebrow">The real code</p>
            <h2 id="code-title" className="mt-1 text-[1.3125rem] font-semibold">
              Read it in the source
            </h2>
            <p className="mt-2 text-[0.9375rem] text-ink-2">
              These excerpts are read from the files when this page renders, so they always match the code.
            </p>
            <div className="mt-6 space-y-8">
              {subsystem.snippets.map((snippet) => (
                <div key={snippet.title}>
                  <ModeDetails summary={snippet.title}>
                    <p className="mb-3 text-[0.9375rem] text-ink-2">
                      <span className="font-medium text-ink">What to notice: </span>
                      <RichText text={snippet.note} />
                    </p>
                    <CodeExcerpt codeRef={snippet.ref} title={snippet.title} />
                  </ModeDetails>
                </div>
              ))}
            </div>
          </section>
        )}

        {subsystem.tests.length > 0 && (
          <section
            id="tests"
            aria-labelledby="tests-title"
            className="scroll-mt-24 border-t border-rule pt-8"
          >
            <p className="eyebrow">Proof</p>
            <h2 id="tests-title" className="mt-1 text-[1.3125rem] font-semibold">
              Tests that prove it
            </h2>
            <ul className="mt-4 space-y-2 text-[0.9375rem]">
              {subsystem.tests.map((test) => (
                <li key={test.name} className="flex gap-3">
                  <span aria-hidden className="mt-0.5 font-mono text-pine-600">
                    ✓
                  </span>
                  <span>
                    “{test.name}”
                    <code className="mt-0.5 block font-mono text-[0.75rem] text-ink-3">{test.file}</code>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="related-title" className="border-t border-rule pt-8">
          <h2 id="related-title" className="eyebrow">
            Related
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {subsystem.related.map((slug) => (
              <li key={slug}>
                <Link
                  href={`/learn/subsystems/${slug}`}
                  className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-rule-strong bg-surface px-3 text-[0.8125rem] hover:border-ink-3"
                >
                  {getSubsystem(slug)?.title ?? slug}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <nav
          aria-label="Previous and next subsystem"
          className="grid gap-3 border-t border-rule pt-8 sm:grid-cols-2"
        >
          {previous ? (
            <Link
              href={`/learn/subsystems/${previous.slug}`}
              className="rounded-[var(--radius-lg)] border border-rule p-4 hover:border-rule-strong"
            >
              <span className="eyebrow">Previous</span>
              <span className="mt-1 block font-medium">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/learn/subsystems/${next.slug}`}
              className="rounded-[var(--radius-lg)] border border-rule p-4 text-right hover:border-rule-strong"
            >
              <span className="eyebrow">Next</span>
              <span className="mt-1 block font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </div>
    </article>
  );
}
