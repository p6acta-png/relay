import type { Metadata } from 'next';
import { LAYERS, NODES, SCENARIOS } from '@/content/learn/architecture';
import { SUBSYSTEMS } from '@/content/learn/subsystems';
import { ArchitectureExplorer } from '../_components/architecture-explorer';
import { ByMode } from '../_components/mode';

export const metadata: Metadata = {
  title: 'Architecture explorer',
  description: 'Click through Relay’s layers and replay real requests step by step.',
};

export default function ArchitecturePage() {
  return (
    <div className="max-w-6xl">
      <header className="max-w-3xl">
        <p className="eyebrow">Interactive</p>
        <h1 className="mt-3 font-serif text-[2.5rem] leading-[1.08] tracking-tight">Architecture explorer</h1>
        <div className="mt-4 text-lg leading-relaxed text-ink-2">
          <ByMode
            beginner={
              <p>
                Every request travels through the same layers, from top to bottom. Pick a request to watch its
                route, or click any box to see what it does.
              </p>
            }
            developer={
              <p>
                One Next.js app, one PostgreSQL database. Requests enter through the proxy, route handlers or
                server actions; guards and a validated AI interpretation come before any write; services run
                inside a tenant transaction together with audit and outbox rows; automations react after
                commit.
              </p>
            }
          />
        </div>
      </header>

      <div className="mt-8">
        <ArchitectureExplorer
          layers={LAYERS}
          nodes={NODES}
          scenarios={SCENARIOS}
          subsystemTitles={Object.fromEntries(SUBSYSTEMS.map((s) => [s.slug, s.title]))}
        />
      </div>
    </div>
  );
}
