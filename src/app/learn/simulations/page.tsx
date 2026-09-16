import type { Metadata } from 'next';
import { DemoModeTag } from '@/components/ui/misc';
import { SIMULATIONS } from '@/content/learn/interview';
import { RichText } from '../_components/rich-text';

export const metadata: Metadata = {
  title: 'What is simulated',
  description:
    'Exactly which parts of Relay are demo implementations, what is real, and how to replace them.',
};

export default function SimulationsPage() {
  return (
    <div className="max-w-3xl">
      <header>
        <p className="eyebrow">Honesty</p>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 font-serif text-[2.5rem] leading-[1.08] tracking-tight">
          What is simulated <DemoModeTag />
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          Relay runs locally at no cost, so a few outside services are replaced by demo implementations. Each
          sits behind a real interface, is labelled in the product, and can be swapped without touching the
          business logic.
        </p>
      </header>

      <div className="mt-10 space-y-6">
        {SIMULATIONS.map((sim) => (
          <section
            key={sim.name}
            aria-labelledby={`sim-${sim.name}`}
            className="rounded-[var(--radius-lg)] border border-rule bg-surface"
          >
            <h2 id={`sim-${sim.name}`} className="border-b border-rule px-5 py-3 font-semibold">
              {sim.name}
            </h2>
            <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-[0.9375rem] sm:grid-cols-[9rem_minmax(0,1fr)]">
              <dt className="eyebrow pt-0.5 text-signal-700">Simulated</dt>
              <dd>
                <RichText text={sim.simulated} />
              </dd>
              <dt className="eyebrow pt-0.5 text-pine-700">Real</dt>
              <dd>
                <RichText text={sim.real} />
              </dd>
              <dt className="eyebrow pt-0.5">Code</dt>
              <dd className="space-y-0.5">
                {sim.where.map((file) => (
                  <code key={file} className="block font-mono text-[0.8125rem] break-all">
                    {file}
                  </code>
                ))}
              </dd>
              <dt className="eyebrow pt-0.5">To make it real</dt>
              <dd className="text-ink-2">
                <RichText text={sim.replace} />
              </dd>
            </dl>
          </section>
        ))}
      </div>

      <section aria-labelledby="not-claimed" className="mt-10 border-t border-rule pt-8">
        <h2 id="not-claimed" className="font-semibold">
          What Relay does not claim
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.9375rem] text-ink-2">
          <li>No certification (such as ISO 27001) and no legal compliance claims, including for GDPR.</li>
          <li>
            The demo businesses, people and addresses are fictional; email addresses use the reserved .example
            domain.
          </li>
          <li>Numbers on the analytics page come from generated demo data.</li>
        </ul>
      </section>
    </div>
  );
}
