import type { Metadata } from 'next';
import Link from 'next/link';
import { STUDY_ORDER } from '@/content/learn/interview';
import { SUBSYSTEM_GROUPS, SUBSYSTEMS } from '@/content/learn/subsystems';
import { WALKTHROUGHS } from '@/content/learn/walkthroughs';
import { ByMode } from './_components/mode';
import { RichText } from './_components/rich-text';

export const metadata: Metadata = { title: { absolute: 'How Relay works' } };

const PIPELINE = [
  'Chat',
  'Validate',
  'Understand',
  'Business rules',
  'Workflow',
  'Action',
  'Save',
  'Notify',
  'Audit',
];

export default function LearnOverview() {
  return (
    <div className="max-w-4xl">
      <header className="max-w-3xl">
        <p className="eyebrow">A guided tour of the codebase</p>
        <h1 className="mt-3 font-serif text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.04] tracking-tight">
          How Relay <em className="text-pine-700">works</em>, and why it is built this way.
        </h1>
        <div className="mt-5 space-y-4 text-lg leading-relaxed text-ink-2">
          <ByMode
            beginner={
              <p>
                Relay helps small businesses — like a bike workshop in Oslo — handle customer messages. A
                customer asks something in a chat; Relay understands it, checks the business’s rules, and
                books a time, records a request, or passes the question to a person. This guide explains every
                important part in plain language first, then in developer terms.
              </p>
            }
            developer={
              <p>
                Relay is a multi-tenant Next.js + TypeScript modular monolith on PostgreSQL. Customer
                conversations go through a fixed pipeline where an untrusted AI interpretation is validated, a
                deterministic flow decides, and services with explicit actor permissions perform changes
                inside tenant-scoped transactions. Excerpts on these pages are read from the real source
                files.
              </p>
            }
          />
        </div>
      </header>

      <figure className="mt-10 rounded-[var(--radius-lg)] border border-rule bg-surface">
        <figcaption className="eyebrow border-b border-rule px-5 py-2.5">
          The operations layer, in one line
        </figcaption>
        <ol className="flex flex-wrap items-center gap-2 px-5 py-4 font-mono text-[0.75rem]">
          {PIPELINE.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span
                className={
                  index === 2
                    ? 'rounded-[var(--radius-sm)] border border-dashed border-signal-500 bg-signal-50 px-2 py-1 text-signal-700'
                    : 'rounded-[var(--radius-sm)] border border-rule-strong bg-paper px-2 py-1'
                }
              >
                {step}
              </span>
              {index < PIPELINE.length - 1 && (
                <span aria-hidden className="text-ink-3">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="border-t border-rule px-5 py-2.5 text-[0.8125rem] text-ink-3">
          The dashed step is the only place AI is involved — and its output is checked before anything else
          happens.
        </p>
      </figure>

      <section aria-labelledby="paths-title" className="mt-12">
        <h2 id="paths-title" className="text-[1.3125rem] font-semibold">
          Three ways in
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              href: '/learn/architecture',
              eyebrow: '10 minutes',
              title: 'Explore the architecture',
              text: 'Click through the layers and replay real requests step by step.',
            },
            {
              href: `/learn/walkthroughs/${WALKTHROUGHS[0]!.slug}`,
              eyebrow: '15 minutes',
              title: 'Follow one booking',
              text: 'From “Can I book a service?” to a confirmed, audited booking — with the code.',
            },
            {
              href: '/learn/interview',
              eyebrow: 'Before an interview',
              title: 'Prepare to explain it',
              text: 'A pitch, likely questions with answers, and the files to read first.',
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-[var(--radius-lg)] border border-rule bg-surface p-5 transition-colors hover:border-ink-3"
            >
              <span className="eyebrow">{card.eyebrow}</span>
              <span className="mt-2 block font-semibold group-hover:underline">{card.title}</span>
              <span className="mt-1 block text-[0.9375rem] text-ink-2">{card.text}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="subsystems-title" className="mt-14">
        <h2 id="subsystems-title" className="text-[1.3125rem] font-semibold">
          Subsystems
        </h2>
        <p className="mt-1 text-[0.9375rem] text-ink-2">
          Each page has the same seven parts: a simple explanation, a developer explanation, why this
          approach, where the code lives, what can fail, what to say in an interview, and a likely follow-up
          question.
        </p>
        <div className="mt-6 space-y-10">
          {SUBSYSTEM_GROUPS.map(({ group, intro }) => (
            <div key={group}>
              <div className="flex flex-wrap items-baseline gap-x-3 border-b border-rule pb-2">
                <h3 className="font-serif text-[1.375rem]">{group}</h3>
                <p className="text-sm text-ink-3">{intro}</p>
              </div>
              <ul className="mt-2 divide-y divide-rule/70">
                {SUBSYSTEMS.filter((s) => s.group === group).map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/learn/subsystems/${s.slug}`}
                      className="group grid gap-1 py-3 sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-6"
                    >
                      <span className="font-medium group-hover:underline">{s.title}</span>
                      <span className="text-[0.9375rem] text-ink-2">{s.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="walkthroughs-title" className="mt-14">
        <h2 id="walkthroughs-title" className="text-[1.3125rem] font-semibold">
          Walkthroughs
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {WALKTHROUGHS.map((w) => (
            <Link
              key={w.slug}
              href={`/learn/walkthroughs/${w.slug}`}
              className="group rounded-[var(--radius-lg)] border border-rule bg-surface p-5 hover:border-ink-3"
            >
              <span className="eyebrow">{w.steps.length} steps</span>
              <span className="mt-2 block font-semibold group-hover:underline">{w.title}</span>
              <span className="mt-1 block text-[0.9375rem] text-ink-2">{w.summary}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="study-title" className="mt-14 border-t border-rule pt-8">
        <h2 id="study-title" className="text-[1.3125rem] font-semibold">
          Reading order for the code
        </h2>
        <ol className="mt-4 space-y-2.5">
          {STUDY_ORDER.slice(0, 6).map((entry, index) => (
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
        <Link
          href="/learn/interview#study"
          className="mt-4 inline-block text-sm text-pine-700 underline underline-offset-2"
        >
          The full list is on the interview page
        </Link>
      </section>
    </div>
  );
}
