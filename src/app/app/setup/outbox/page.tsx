import type { Metadata } from 'next';
import { AccessNotice, DemoModeTag, EmptyState } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { formatInZone } from '@/lib/time';
import { listOutbox } from '@/modules/notifications/email';
import { pageAccess } from '@/server/context';
import { SimulateEmailForm } from './simulate-email-form';

export const metadata: Metadata = { title: 'Email outbox' };

async function load() {
  const { dashboard, allowed } = await pageAccess('outbox.view');
  if (!allowed) return null;
  const emails = await withTenant(dashboard.ctx.organizationId, (scope) => listOutbox(scope, 60));
  return { emails, tz: dashboard.organization.timezone };
}

export default async function OutboxPage() {
  const data = await load();
  if (!data) return <AccessNotice what="the email outbox" />;
  const { emails, tz } = data;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="outbox-heading" className="space-y-4">
        <div>
          <h2 id="outbox-heading" className="flex items-center gap-2 font-semibold">
            Email outbox <DemoModeTag />
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-3">
            Every email Relay would send — confirmations, invitations, replies — is stored here instead of
            being delivered. Swapping in a real provider only changes the adapter in{' '}
            <span className="font-mono text-[0.8125rem]">modules/notifications/email.ts</span>.
          </p>
        </div>
        {emails.length === 0 ? (
          <EmptyState title="No emails yet">
            Book a time in the chat and the confirmation shows up here.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {emails.map((email) => (
              <li key={email.id}>
                <details className="group rounded-[var(--radius-lg)] border border-rule bg-surface open:bg-white">
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{email.subject}</span>
                    <span className="text-xs text-ink-3">to {email.toAddress}</span>
                    <time
                      dateTime={email.createdAt.toISOString()}
                      className="tabular font-mono text-xs text-ink-3"
                    >
                      {formatInZone(email.createdAt, tz, 'd MMM HH:mm')}
                    </time>
                  </summary>
                  <div className="border-t border-rule px-4 py-3">
                    <p className="mb-2 font-mono text-[0.6875rem] text-ink-3 uppercase">
                      {email.status === 'STORED_IN_OUTBOX'
                        ? 'Stored — not delivered'
                        : email.status.toLowerCase()}{' '}
                      · provider {email.provider}
                      {email.relatedType && ` · ${email.relatedType}`}
                    </p>
                    <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
                      {email.textBody}
                    </pre>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside
        aria-labelledby="simulate-heading"
        className="h-fit rounded-[var(--radius-lg)] border border-dashed border-signal-500/50 bg-surface p-5"
      >
        <h2 id="simulate-heading" className="flex items-center gap-2 font-semibold">
          Simulate an incoming email <DemoModeTag>Demo</DemoModeTag>
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-3">
          Stands in for a mail provider’s webhook. Relay reads it with the same AI boundary as the chat: it
          answers from your knowledge base, or hands it to the inbox.
        </p>
        <SimulateEmailForm />
      </aside>
    </div>
  );
}
