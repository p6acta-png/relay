import type { Metadata } from 'next';
import Link from 'next/link';
import { HONESTY, PITCH, QUESTIONS, STUDY_ORDER } from '@/content/learn/interview';
import { getSubsystem } from '@/content/learn/subsystems';
import { ModeDetails } from '../_components/mode';
import { Paragraphs, RichText } from '../_components/rich-text';

export const metadata: Metadata = {
  title: 'Interview preparation',
  description: 'How to present Relay, likely questions with answers, and the files to study first.',
};

export default function InterviewPage() {
  const categories = [...new Set(QUESTIONS.map((q) => q.category))];

  return (
    <div className="max-w-3xl">
      <header>
        <p className="eyebrow">Interview preparation</p>
        <h1 className="mt-3 font-serif text-[2.5rem] leading-[1.08] tracking-tight">Explaining Relay</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          Say what it does, show one flow, name the trade-offs — and be exact about what is real and what is
          simulated.
        </p>
      </header>

      <section aria-labelledby="pitch-title" className="mt-10">
        <h2 id="pitch-title" className="text-[1.3125rem] font-semibold">
          The pitch
        </h2>
        <p className="eyebrow mt-4">In 30 seconds</p>
        <blockquote className="mt-2 border-l-4 border-signal-500 bg-surface py-4 pr-4 pl-5 font-serif text-[1.1875rem] leading-relaxed">
          {PITCH.short}
        </blockquote>
        <p className="eyebrow mt-6">In two minutes</p>
        <Paragraphs items={PITCH.long} className="mt-2 space-y-3 leading-[1.7]" />
      </section>

      <section
        aria-labelledby="demo-title"
        className="mt-12 rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
      >
        <h2 id="demo-title" className="font-semibold">
          A five-minute demo
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[0.9375rem] text-ink-2 marker:font-mono marker:text-ink-3">
          <li>Open /w/eik-og-kant and book a service in the chat. Point out the “Demo mode” label.</li>
          <li>Ask “Do you offer a student discount?” — show the honest hand-off.</li>
          <li>Log in as Jonas (staff): the inbox shows the interpretation and hand-off reason; reply.</li>
          <li>
            Log in as Ingrid (owner): the booking, the audit log, the email outbox and an automation’s run
            history.
          </li>
          <li>Open one test file — database-guarantees or chat — to show the claims are tested.</li>
        </ol>
        <p className="mt-3 text-[0.8125rem] text-ink-3">The full script with timings is in DEMO_SCRIPT.md.</p>
      </section>

      <section aria-labelledby="honesty-title" className="mt-12">
        <h2 id="honesty-title" className="text-[1.3125rem] font-semibold">
          Being honest about how it was built
        </h2>
        <ul className="mt-4 space-y-3 leading-[1.7]">
          {HONESTY.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-3" />
              <span>
                <RichText text={line} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="questions-title" className="mt-12">
        <h2 id="questions-title" className="text-[1.3125rem] font-semibold">
          Questions you are likely to get
        </h2>
        <p className="mt-1 text-[0.9375rem] text-ink-2">
          Try answering out loud before opening each answer. Every subsystem page has one more follow-up
          question.
        </p>
        <div className="mt-6 space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="eyebrow border-b border-rule pb-2">{category}</h3>
              <ul className="mt-3 space-y-5">
                {QUESTIONS.filter((q) => q.category === category).map((q) => (
                  <li key={q.question}>
                    <p className="font-serif text-[1.1875rem] leading-snug">“{q.question}”</p>
                    <ModeDetails summary="Model answer" className="mt-2">
                      <Paragraphs items={q.answer} className="space-y-2 leading-[1.7] text-ink-2" />
                      <p className="mt-2 text-[0.8125rem] text-ink-3">
                        Review:{' '}
                        {q.review.map((slug, i) => (
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
                    </ModeDetails>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section
        id="study"
        aria-labelledby="study-title"
        className="mt-12 scroll-mt-24 border-t border-rule pt-8"
      >
        <h2 id="study-title" className="text-[1.3125rem] font-semibold">
          Files to study before an interview
        </h2>
        <ol className="mt-4 space-y-3">
          {STUDY_ORDER.map((entry, index) => (
            <li key={entry.file} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
              <span className="font-mono text-sm text-ink-3">{String(index + 1).padStart(2, '0')}</span>
              <span>
                <code className="font-mono text-[0.8125rem] break-all">{entry.file}</code>
                <span className="block text-[0.9375rem] text-ink-2">
                  <RichText text={entry.why} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
