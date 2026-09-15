import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState, FormMessage } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { listKnowledge } from '@/modules/catalog/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { requireDashboard } from '@/server/context';

export const metadata: Metadata = { title: 'Knowledge' };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { ctx } = await requireDashboard();
  const items = await withTenant(ctx.organizationId, (scope) => listKnowledge(scope, ctx));
  const canManage = isAllowed(ctx, 'setup.manage');

  return (
    <section className="space-y-4" aria-labelledby="knowledge-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="knowledge-heading" className="font-semibold">
            Knowledge
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-3">
            Answers Relay may give word for word. It never makes up an answer: if a question doesn’t match one
            of these, the conversation goes to a person.
          </p>
        </div>
        {canManage && (
          <ButtonLink href="/app/setup/knowledge/new" size="sm">
            New answer
          </ButtonLink>
        )}
      </div>
      {saved && (
        <FormMessage tone="success">Saved. Relay uses this answer from the next message.</FormMessage>
      )}

      {items.length === 0 ? (
        <EmptyState title="No answers yet">
          Start with the questions you answer most often: parking, payment, prices.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-rule rounded-[var(--radius-lg)] border border-rule bg-surface">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/app/setup/knowledge/${item.id}`} className="font-medium hover:underline">
                  {item.question}
                </Link>
                {!item.published && <Badge tone="outline">Draft</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-ink-2">{item.answer}</p>
              {item.keywords.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {item.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-[var(--radius-sm)] bg-sunken px-1.5 font-mono text-[0.6875rem] leading-5 text-ink-2"
                    >
                      {k}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
