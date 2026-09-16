'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ArchitectureNode, ArchitectureScenario } from '@/content/learn/architecture';
import { cx } from '@/lib/cx';

interface Layer {
  id: string;
  label: string;
  hint: string;
}

/**
 * Click a box to see what it does, or pick a request and step through the boxes it passes.
 * Everything is plain buttons and text, so it works with a keyboard and a screen reader.
 */
export function ArchitectureExplorer({
  layers,
  nodes,
  scenarios,
  subsystemTitles,
}: {
  layers: readonly Layer[];
  nodes: ArchitectureNode[];
  scenarios: ArchitectureScenario[];
  subsystemTitles: Record<string, string>;
}) {
  const [scenarioSlug, setScenarioSlug] = useState<string | null>(scenarios[0]?.slug ?? null);
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scenario = scenarios.find((s) => s.slug === scenarioSlug) ?? null;
  const current = scenario?.steps[step];
  const selected = nodes.find((n) => n.id === (selectedId ?? current?.node)) ?? null;

  // Step numbers each node appears at in the chosen scenario (a node can appear more than once).
  const stepsByNode = new Map<string, number[]>();
  scenario?.steps.forEach((s, i) => stepsByNode.set(s.node, [...(stepsByNode.get(s.node) ?? []), i + 1]));

  const chooseScenario = (slug: string | null) => {
    setScenarioSlug(slug);
    setStep(0);
    setSelectedId(null);
  };
  const goTo = (index: number) => {
    setStep(index);
    setSelectedId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose a request to trace">
        <span className="mr-1 text-sm text-ink-3">Trace a request:</span>
        {scenarios.map((s) => (
          <button
            key={s.slug}
            type="button"
            aria-pressed={scenarioSlug === s.slug}
            onClick={() => chooseScenario(s.slug)}
            className={cx(
              'h-8 rounded-[var(--radius-md)] border px-3 text-[0.8125rem] transition-colors',
              scenarioSlug === s.slug
                ? 'border-ink bg-ink text-paper'
                : 'border-rule-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink',
            )}
          >
            {s.title}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={scenarioSlug === null}
          onClick={() => chooseScenario(null)}
          className={cx(
            'h-8 rounded-[var(--radius-md)] px-3 text-[0.8125rem]',
            scenarioSlug === null
              ? 'font-medium text-ink underline underline-offset-4'
              : 'text-ink-3 hover:text-ink',
          )}
        >
          Just explore
        </button>
      </div>

      {scenario && current && (
        <div className="rounded-[var(--radius-lg)] border border-ink bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
            <p className="font-mono text-[0.75rem] text-ink-3">
              Step {step + 1} of {scenario.steps.length}
            </p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => goTo(Math.max(0, step - 1))}
                disabled={step === 0}
                className="h-8 rounded-[var(--radius-md)] border border-rule-strong bg-white px-3 text-[0.8125rem] disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => goTo(Math.min(scenario.steps.length - 1, step + 1))}
                disabled={step === scenario.steps.length - 1}
                className="h-8 rounded-[var(--radius-md)] bg-pine-700 px-3 text-[0.8125rem] text-white hover:bg-pine-800 disabled:opacity-40"
              >
                Next step →
              </button>
            </div>
          </div>
          <p aria-live="polite" className="px-4 py-3 text-[0.9375rem] leading-relaxed">
            <span className="font-medium">{nodes.find((n) => n.id === current.node)?.label}: </span>
            {current.text}
          </p>
          {scenario.walkthrough && step === scenario.steps.length - 1 && (
            <p className="border-t border-rule px-4 py-2.5 text-[0.8125rem]">
              <Link
                href={`/learn/walkthroughs/${scenario.walkthrough}`}
                className="text-pine-700 underline underline-offset-2"
              >
                Read this request step by step, with the code
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <ol className="space-y-2" aria-label="Architecture layers, from request to reaction">
          {layers.map((layer) => (
            <li
              key={layer.id}
              className="grid gap-2 rounded-[var(--radius-lg)] border border-rule bg-paper p-2 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center"
            >
              <div className="px-2">
                <p className="text-[0.8125rem] font-semibold">{layer.label}</p>
                <p className="text-[0.6875rem] leading-tight text-ink-3">{layer.hint}</p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {nodes
                  .filter((node) => node.layer === layer.id)
                  .map((node) => {
                    const numbers = stepsByNode.get(node.id) ?? [];
                    const isCurrent = current?.node === node.id && selectedId === null;
                    const isSelected = selected?.id === node.id;
                    const onRoute = numbers.length > 0;
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={`${node.label}${onRoute ? `, step ${numbers.join(' and ')} of this request` : ''}`}
                          onClick={() => setSelectedId(node.id)}
                          className={cx(
                            'relative flex h-10 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-[0.8125rem] transition-colors',
                            isCurrent
                              ? 'border-signal-500 bg-signal-50 font-medium text-ink ring-2 ring-signal-500/30'
                              : isSelected
                                ? 'border-ink bg-white font-medium text-ink'
                                : onRoute
                                  ? 'border-ink-3 bg-white text-ink'
                                  : scenario
                                    ? 'border-rule bg-surface text-ink-3 hover:text-ink'
                                    : 'border-rule-strong bg-white text-ink hover:border-ink-3',
                          )}
                        >
                          {node.label}
                          {numbers.length > 0 && (
                            <span aria-hidden className="flex gap-0.5">
                              {numbers.map((n) => (
                                <span
                                  key={n}
                                  className={cx(
                                    'flex size-4 items-center justify-center rounded-full font-mono text-[0.5625rem]',
                                    n - 1 === step
                                      ? 'bg-signal-700 text-white'
                                      : n - 1 < step
                                        ? 'bg-ink text-paper'
                                        : 'bg-sunken text-ink-2',
                                  )}
                                >
                                  {n}
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ol>

        <aside
          aria-live="polite"
          className="h-fit rounded-[var(--radius-lg)] border border-rule bg-surface p-5 xl:sticky xl:top-24"
        >
          {selected ? (
            <>
              <p className="eyebrow">{layers.find((l) => l.id === selected.layer)?.label}</p>
              <h2 className="mt-1 text-[1.125rem] font-semibold">{selected.label}</h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed">{selected.what}</p>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">Why: </span>
                {selected.why}
              </p>
              <p className="eyebrow mt-4">Files</p>
              <ul className="mt-1 space-y-0.5">
                {selected.files.map((file) => (
                  <li key={file}>
                    <code className="font-mono text-[0.75rem] break-all text-ink-2">{file}</code>
                  </li>
                ))}
              </ul>
              <Link
                href={`/learn/subsystems/${selected.subsystem}`}
                className="mt-4 inline-block text-[0.875rem] text-pine-700 underline underline-offset-2"
              >
                Read: {subsystemTitles[selected.subsystem]}
              </Link>
            </>
          ) : (
            <p className="text-[0.9375rem] text-ink-2">
              Select any box to see what it does and where the code lives.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
