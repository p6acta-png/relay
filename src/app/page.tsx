import type { Metadata } from 'next';
import Link from 'next/link';
import { RelayWordmark } from '@/components/brand/logo';
import { DemoModeTag } from '@/components/ui/misc';
import { DEMO_ACCOUNTS, DEMO_BUSINESS_SLUG, DEMO_PASSWORD } from '@/content/demo';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: { absolute: 'Relay — customer messages in, bookings out' },
};

const PRINCIPLES = [
  {
    title: 'It answers from what you told it',
    text: 'Opening hours, prices and your own FAQ answers — word for word, with the source. Anything else goes to a person instead of a guess.',
  },
  {
    title: 'It never double-books',
    text: 'Free times come from each person’s working hours, time off and existing bookings, and the database itself refuses overlapping bookings.',
  },
  {
    title: 'It shows its work',
    text: 'Staff see what Relay understood and why it handed over. Every booking, hand-off and automation is written to an append-only audit log.',
  },
];

const cta =
  'inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-5 text-[0.9375rem] font-medium transition-colors';

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <Link href="/" aria-label="Relay home">
            <RelayWordmark />
          </Link>
          <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-[0.9375rem] sm:gap-4">
            <Link href="/learn" className="hidden px-2 py-1 text-ink-2 hover:text-ink sm:inline">
              How it works
            </Link>
            <Link href="/login" className="px-2 py-1 text-ink-2 hover:text-ink">
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-rule-strong bg-surface px-3.5 text-sm font-medium hover:border-ink-3"
            >
              Create a business
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pt-14 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pt-20">
          <div>
            <p className="eyebrow">For small appointment-based businesses</p>
            <h1 className="mt-5 font-serif text-[clamp(2.75rem,6.5vw,4.5rem)] leading-[0.98] tracking-tight">
              Customer messages in. <em className="text-pine-700">Bookings, leads and tasks</em> out.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              Relay sits on your booking page and handles the conversations you have every day: it answers
              from your own settings, books people into real free times with the right person, and hands
              anything unusual to your team — with a record of what it did and why.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/w/${DEMO_BUSINESS_SLUG}`}
                className={`${cta} bg-pine-700 text-white hover:bg-pine-800`}
              >
                See it on a workshop’s page
              </Link>
              <Link
                href="/learn"
                className={`${cta} border border-rule-strong bg-surface hover:border-ink-3`}
              >
                How it works
              </Link>
            </div>
          </div>

          <figure aria-labelledby="specimen-caption" className="self-start">
            <div className="rounded-[var(--radius-lg)] border border-rule bg-surface shadow-[var(--shadow-pop)]">
              <div className="flex items-center justify-between border-b border-rule px-5 py-3">
                <span className="text-sm font-medium">Eik &amp; Kant · chat</span>
                <span className="font-mono text-[0.6875rem] text-ink-3">Tue 09:14</span>
              </div>
              <div className="space-y-3 px-5 py-4 text-[0.9375rem]">
                <p className="ml-auto w-fit max-w-[85%] rounded-[var(--radius-lg)] rounded-br-[3px] bg-ink px-3.5 py-2 text-paper">
                  Can I get my bike serviced next Tuesday afternoon?
                </p>
                <p className="w-fit max-w-[90%] rounded-[var(--radius-lg)] rounded-bl-[3px] border border-rule bg-white px-3.5 py-2">
                  These times are free for Standard bike service on Tuesday afternoon:
                </p>
                <div className="flex flex-wrap gap-1.5 font-mono text-[0.8125rem]" aria-hidden>
                  {['13:00', '14:00', '15:30'].map((time, index) => (
                    <span
                      key={time}
                      className={
                        index === 1
                          ? 'rounded-[var(--radius-md)] border border-pine-700 bg-pine-700 px-2.5 py-1 text-white'
                          : 'rounded-[var(--radius-md)] border border-rule-strong bg-white px-2.5 py-1'
                      }
                    >
                      {time}
                    </span>
                  ))}
                </div>
              </div>
              <ol className="divide-y divide-rule/70 border-t border-rule bg-paper font-mono text-[0.75rem]">
                {[
                  ['Understood', 'book · Standard bike service · Tue afternoon'],
                  ['Checked', '3 free times, 2 mechanics, rules applied'],
                  ['Booked', 'EK-7KQ3M · Tue 14:00 · Jonas Haugen'],
                  ['Recorded', 'booking.created → audit log · email queued'],
                ].map(([step, detail]) => (
                  <li key={step} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 px-5 py-2">
                    <span className={step === 'Booked' ? 'text-signal-700' : 'text-ink-2'}>{step}</span>
                    <span className="truncate text-ink">{detail}</span>
                  </li>
                ))}
              </ol>
            </div>
            <figcaption id="specimen-caption" className="mt-3 text-[0.8125rem] text-ink-3">
              One message, and what Relay did with it. The dashboard shows the same trail for every
              conversation.
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="principles-title" className="border-y border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <h2 id="principles-title" className="eyebrow">
              Why a small business can trust it
            </h2>
            <ol className="mt-6 grid gap-8 md:grid-cols-3">
              {PRINCIPLES.map((principle, index) => (
                <li key={principle.title}>
                  <span className="font-mono text-[0.8125rem] text-ink-3">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 font-serif text-[1.5rem] leading-snug">{principle.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-2">{principle.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {env.DEMO_MODE && (
          <section aria-labelledby="demo-title" className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="demo-title" className="font-serif text-[2rem] leading-tight">
                Try the demo
              </h2>
              <DemoModeTag />
            </div>
            <p className="mt-2 max-w-2xl text-ink-2">
              Everything runs locally. The AI, email delivery and bot checks are simulated and labelled — see{' '}
              <Link href="/learn/simulations" className="text-pine-700 underline underline-offset-2">
                what is simulated
              </Link>
              .
            </p>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {[
                {
                  title: '1 · A customer books',
                  steps: [
                    'Open the Eik & Kant page and click “Ask a question”.',
                    'Write: Can I book a standard service next Tuesday afternoon?',
                    'Pick a time, leave a name and email, confirm.',
                    'Log in as Ingrid to see the booking, the audit log and the email outbox.',
                  ],
                },
                {
                  title: '2 · A question Relay can’t answer',
                  steps: [
                    'In the chat, ask: Do you offer a student discount?',
                    'Relay says a person will reply, and asks for an email.',
                    'Log in as Jonas: the conversation is waiting in the inbox, with a task.',
                    'Reply — the answer appears in the customer’s chat within seconds.',
                  ],
                },
              ].map((scenario) => (
                <div
                  key={scenario.title}
                  className="rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
                >
                  <h3 className="font-semibold">{scenario.title}</h3>
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[0.9375rem] text-ink-2 marker:font-mono marker:text-ink-3">
                    {scenario.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>

            <div
              className="mt-6 overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface"
              tabIndex={0}
              role="region"
              aria-label="Demo accounts"
            >
              <table className="w-full min-w-[34rem] text-left text-sm">
                <caption className="border-b border-rule px-5 py-3 text-left">
                  <span className="font-semibold">Demo accounts</span>{' '}
                  <span className="text-ink-2">
                    — password <code className="font-mono text-ink">{DEMO_PASSWORD}</code>
                  </span>
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="eyebrow px-5 py-2.5 font-normal">
                      Email
                    </th>
                    <th scope="col" className="eyebrow px-5 py-2.5 font-normal">
                      Business
                    </th>
                    <th scope="col" className="eyebrow px-5 py-2.5 font-normal">
                      What you can see
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_ACCOUNTS.map((account) => (
                    <tr key={account.email} className="border-t border-rule/70">
                      <td className="px-5 py-2.5 font-mono text-[0.8125rem]">{account.email}</td>
                      <td className="px-5 py-2.5">{account.business}</td>
                      <td className="px-5 py-2.5 text-ink-2">{account.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/w/${DEMO_BUSINESS_SLUG}`}
                className={`${cta} bg-pine-700 text-white hover:bg-pine-800`}
              >
                Open the Eik &amp; Kant page
              </Link>
              <Link
                href="/login"
                className={`${cta} border border-rule-strong bg-surface hover:border-ink-3`}
              >
                Log in to the dashboard
              </Link>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[0.8125rem] text-ink-3 sm:px-8">
          <p>Relay is a portfolio project. The businesses and people in the demo are fictional.</p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/learn" className="hover:text-ink">
              How Relay works
            </Link>
            <Link href="/learn/interview" className="hover:text-ink">
              Interview notes
            </Link>
            <Link href="/learn/simulations" className="hover:text-ink">
              What is simulated
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
