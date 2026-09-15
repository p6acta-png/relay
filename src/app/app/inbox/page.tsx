import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessNotice, Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { IconMail } from '@/components/ui/icons';
import { withTenant } from '@/lib/db';
import { cx } from '@/lib/cx';
import { formatRelative } from '@/lib/time';
import { countByStatus, listConversations, type InboxFilter } from '@/modules/conversations/conversations';
import { previewCustomerMessage } from '@/modules/conversations/model';
import { pageAccess } from '@/server/context';
import { ConversationStatusBadge, FilterTabs, Initials } from '../_components/status';

export const metadata: Metadata = { title: 'Inbox' };

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'needs_human', label: 'Needs a person' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

async function load(filter: InboxFilter) {
  const { dashboard, allowed } = await pageAccess('inbox.view');
  if (!allowed) return null;
  const data = await withTenant(dashboard.ctx.organizationId, async (scope) => ({
    conversations: await listConversations(scope, dashboard.ctx, filter),
    counts: await countByStatus(scope),
  }));
  return { ...data, tz: dashboard.organization.timezone, now: new Date() };
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const requested = (await searchParams).filter;
  const filter: InboxFilter = FILTERS.some((f) => f.key === requested)
    ? (requested as InboxFilter)
    : 'needs_human';
  const data = await load(filter);
  if (!data) return <AccessNotice what="the inbox" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inbox"
        title="Conversations"
        description="Everything customers wrote, what Relay understood, and what it did. Hand-offs wait here for a person."
      />
      <FilterTabs
        label="Filter conversations"
        tabs={FILTERS.map((f) => ({
          href: `/app/inbox?filter=${f.key}`,
          label: f.label,
          active: f.key === filter,
          urgent: f.key === 'needs_human',
          count:
            f.key === 'needs_human'
              ? data.counts.NEEDS_HUMAN
              : f.key === 'open'
                ? data.counts.OPEN
                : undefined,
        }))}
      />

      {data.conversations.length === 0 ? (
        <EmptyState
          title={filter === 'needs_human' ? 'Nobody is waiting for a person' : 'No conversations here'}
        >
          {filter === 'needs_human'
            ? 'When Relay can’t answer something, or a customer asks for a person, the conversation shows up here.'
            : 'Conversations appear as soon as a customer writes on your public page.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-surface">
          {data.conversations.map((conversation) => {
            const preview = previewCustomerMessage(conversation.messages);
            const name = conversation.customer?.name ?? 'Website visitor';
            return (
              <li key={conversation.id}>
                <Link
                  href={`/app/inbox/${conversation.id}`}
                  className={cx(
                    'grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3.5 hover:bg-sunken/40',
                    conversation.status === 'NEEDS_HUMAN' && 'border-l-[3px] border-l-signal-500 pl-[13px]',
                  )}
                >
                  <Initials name={name} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      {conversation.channel === 'EMAIL' && (
                        <Badge tone="outline">
                          <IconMail className="size-3" /> Email
                        </Badge>
                      )}
                      <ConversationStatusBadge status={conversation.status} />
                      {conversation.flaggedReason && <Badge tone="danger">Flagged</Badge>}
                      {conversation._count.bookings > 0 && <Badge tone="pine">Booked</Badge>}
                      {conversation._count.leads > 0 && <Badge tone="info">Lead</Badge>}
                    </span>
                    <span className="mt-1 line-clamp-1 block text-sm text-ink-2">
                      {preview ? `“${preview}”` : ''}
                    </span>
                    {conversation.assignee && (
                      <span className="mt-0.5 block text-xs text-ink-3">
                        Assigned to {conversation.assignee.user.name}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[0.6875rem] whitespace-nowrap text-ink-3">
                    {formatRelative(conversation.lastMessageAt, data.now, data.tz)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
