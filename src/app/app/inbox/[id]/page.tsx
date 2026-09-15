import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { IconArrowRight, IconHandoff, IconMail } from '@/components/ui/icons';
import { AccessNotice, Badge, FormMessage } from '@/components/ui/misc';
import { prisma, withTenant } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { cx } from '@/lib/cx';
import { formatInZone, formatRelative } from '@/lib/time';
import { interpretationSchema } from '@/modules/assistant/interpretation';
import { getConversationDetail } from '@/modules/conversations/conversations';
import { replyBlocksSchema, type ReplyBlock } from '@/modules/conversations/model';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import {
  BookingStatusBadge,
  ConversationStatusBadge,
  LeadStatusBadge,
  Panel,
} from '../../_components/status';
import { conversationStatusAction } from '../actions';
import { AssignSelect, ReplyForm } from './conversation-forms';

export const metadata: Metadata = { title: 'Conversation' };

/** Stored interpretation plus which provider produced it and whether its output was rejected. */
const understandingSchema = interpretationSchema.extend({
  provider: z.string().optional(),
  rejected: z.string().nullable().optional(),
});

const HANDOFF_REASONS: Record<string, string> = {
  unanswered_question: 'Relay had no reliable answer',
  customer_asked: 'The customer asked for a person',
  no_availability: 'No free times for the service',
  flagged: 'Looked like spam or abuse',
  staff_took_over: 'A team member took over',
  automation_rule: 'An automation handed it over',
};

async function load(id: string) {
  const { dashboard, allowed } = await pageAccess('inbox.view');
  if (!allowed) return { denied: true as const };
  try {
    const conversation = await withTenant(dashboard.ctx.organizationId, (scope) =>
      getConversationDetail(scope, dashboard.ctx, id),
    );
    const handoffAudit = await withTenant(dashboard.ctx.organizationId, ({ db, organizationId }) =>
      db.auditLog.findFirst({
        where: { organizationId, entityId: id, action: 'conversation.handed_off' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    const team = await prisma.membership.findMany({
      where: { organizationId: dashboard.ctx.organizationId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { dashboard, conversation, handoffAudit, team, now: new Date() };
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

function describeBlock(block: ReplyBlock): string {
  switch (block.type) {
    case 'quick_replies':
      return `Suggested: ${block.options.map((o) => o.label).join(' · ')}`;
    case 'service_options':
      return `Showed ${block.services.length} services to choose from`;
    case 'slot_options':
      return `Offered ${block.days.reduce((n, d) => n + d.slots.length, 0)} times: ${block.days
        .map((d) => `${d.label.replace(/^(\w{3})\w*/, '$1')} ${d.slots.map((s) => s.time).join(', ')}`)
        .join(' · ')}`;
    case 'details_form':
      return `Asked for contact details (${block.purpose})${block.errors ? ' — the first attempt had errors' : ''}`;
    case 'booking_summary':
      return `Summary shown: ${block.service}, ${block.when}${block.needsApproval ? ' (needs approval)' : ''}`;
    case 'booking_result':
      return `${block.status === 'CONFIRMED' ? 'Booking confirmed' : 'Booking request sent'}: ${block.reference}`;
    case 'source':
      return block.label;
    case 'handoff_notice':
      return `Told the customer a person will reply within ${block.replyWithinHours} hours`;
  }
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const [{ id }, { email: emailOutcome }] = await Promise.all([params, searchParams]);
  const data = await load(id);
  if (data === null) notFound();
  if ('denied' in data) return <AccessNotice what="the inbox" />;
  const { dashboard, conversation, handoffAudit, team, now } = data;
  const tz = dashboard.organization.timezone;
  const canReply = isAllowed(dashboard.ctx, 'inbox.reply');
  const name = conversation.customer?.name ?? 'Website visitor';
  const handoffReason = (handoffAudit?.metadata as { reason?: string } | null)?.reason;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/inbox" className="text-sm text-ink-2 hover:text-ink">
          ← Inbox
        </Link>
        {emailOutcome && (
          <FormMessage tone="info" className="mt-3">
            Simulated email received.{' '}
            {emailOutcome === 'answered'
              ? 'Relay found the answer in your knowledge base and replied — the reply is in the email outbox.'
              : 'Relay could not answer it safely, so it sent an acknowledgement and handed the conversation to the team.'}
          </FormMessage>
        )}
        <div className="mt-3 flex flex-col gap-4 border-b border-rule pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ConversationStatusBadge status={conversation.status} />
              {conversation.channel === 'EMAIL' ? (
                <Badge tone="outline">
                  <IconMail className="size-3" /> Email
                </Badge>
              ) : (
                <Badge tone="outline">Web chat</Badge>
              )}
              {conversation.assistantActive ? (
                <Badge tone="pine">Relay is answering</Badge>
              ) : (
                <Badge tone="neutral">Relay is paused</Badge>
              )}
              {conversation.flaggedReason && (
                <Badge tone="danger">Flagged: {conversation.flaggedReason.replace(/_/g, ' ')}</Badge>
              )}
            </div>
            <h1 className="mt-2 text-[1.625rem] leading-tight font-semibold">
              {conversation.subject ?? name}
            </h1>
            <p className="mt-1 text-sm text-ink-3">
              Started {formatInZone(conversation.createdAt, tz, "EEEE d MMMM 'at' HH:mm")} · last message{' '}
              {formatRelative(conversation.lastMessageAt, now, tz)}
            </p>
          </div>
          {canReply && (
            <form action={conversationStatusAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="conversationId" value={conversation.id} />
              {conversation.assistantActive ? (
                <Button type="submit" name="action" value="take_over" variant="secondary" size="sm">
                  Take over from Relay
                </Button>
              ) : (
                <Button type="submit" name="action" value="hand_back" variant="secondary" size="sm">
                  Hand back to Relay
                </Button>
              )}
              {conversation.status === 'RESOLVED' ? (
                <Button type="submit" name="action" value="reopen" variant="secondary" size="sm">
                  Reopen
                </Button>
              ) : (
                <Button type="submit" name="action" value="resolve" size="sm">
                  Mark resolved
                </Button>
              )}
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Transcript" className="min-w-0 space-y-6">
          {conversation.handedOffAt && (
            <Panel className="flex items-start gap-3 border-signal-500/30 bg-signal-50 p-4 text-sm text-signal-700">
              <IconHandoff className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">
                  Handed to the team {formatRelative(conversation.handedOffAt, now, tz)}
                  {handoffReason ? ` — ${HANDOFF_REASONS[handoffReason] ?? handoffReason}` : ''}
                </p>
                <p className="mt-0.5 text-signal-700/80">
                  {conversation.firstStaffReplyAt
                    ? `First reply ${formatRelative(conversation.firstStaffReplyAt, now, tz)}.`
                    : `No reply yet. ${conversation.customer?.email ? 'Your reply is also emailed to the customer.' : 'The customer hasn’t left an email, so they’ll only see your reply if they come back to the chat.'}`}
                </p>
              </div>
            </Panel>
          )}

          <ol className="space-y-5">
            {conversation.messages.map((message) => {
              const understanding = message.understanding
                ? understandingSchema.safeParse(message.understanding)
                : null;
              const blocks = replyBlocksSchema.safeParse(message.blocks ?? []);
              const time = formatInZone(message.createdAt, tz, 'd MMM HH:mm');
              if (message.author === 'CUSTOMER') {
                return (
                  <li key={message.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="rounded-[var(--radius-lg)] border border-rule bg-surface px-4 py-3">
                      <p className="eyebrow mb-1">
                        {name} · {time}
                      </p>
                      <p className="text-[0.9375rem] whitespace-pre-wrap">{message.body}</p>
                    </div>
                    {understanding?.success && (
                      <details className="group self-start rounded-[var(--radius-md)] border border-dashed border-rule-strong px-3 py-2 text-xs">
                        <summary className="cursor-pointer list-none text-ink-2 [&::-webkit-details-marker]:hidden">
                          <span className="eyebrow block">Relay understood</span>
                          <span className="mt-0.5 block font-medium text-ink">
                            {understanding.data.summary}
                          </span>
                          <span className="mt-0.5 block text-ink-3">
                            {Math.round(understanding.data.confidence * 100)} % confidence · details
                          </span>
                        </summary>
                        <dl className="mt-2 space-y-1 border-t border-rule pt-2 text-ink-2">
                          <div>
                            <dt className="inline text-ink-3">Intent: </dt>
                            <dd className="inline font-mono">{understanding.data.intent}</dd>
                          </div>
                          {understanding.data.topic !== 'none' && (
                            <div>
                              <dt className="inline text-ink-3">Topic: </dt>
                              <dd className="inline font-mono">{understanding.data.topic}</dd>
                            </div>
                          )}
                          {understanding.data.signals.length > 0 && (
                            <div>
                              <dt className="text-ink-3">Why:</dt>
                              <dd>
                                <ul className="list-inside list-disc">
                                  {understanding.data.signals.map((s) => (
                                    <li key={s}>{s}</li>
                                  ))}
                                </ul>
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt className="inline text-ink-3">Provider: </dt>
                            <dd className="inline font-mono">{understanding.data.provider ?? 'unknown'}</dd>
                          </div>
                          {understanding.data.rejected && (
                            <p className="text-danger-700">
                              Provider output rejected ({understanding.data.rejected}) — treated as not
                              understood.
                            </p>
                          )}
                        </dl>
                      </details>
                    )}
                  </li>
                );
              }
              return (
                <li
                  key={message.id}
                  className={cx(
                    'max-w-[46rem]',
                    message.author === 'STAFF' && 'border-l-2 border-signal-500 pl-4',
                  )}
                >
                  <p className="eyebrow mb-1">
                    {message.author === 'STAFF'
                      ? `${message.staffAuthor?.user.name ?? 'Former team member'} · ${time}`
                      : `Relay${message.author === 'SYSTEM' ? ' (system)' : ''} · ${time}`}
                  </p>
                  <p className="text-[0.9375rem] whitespace-pre-wrap text-ink">{message.body}</p>
                  {blocks.success && blocks.data.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-ink-3">
                      {blocks.data.map((block, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span aria-hidden>↳</span>
                          {describeBlock(block)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>

          {canReply && (
            <ReplyForm
              conversationId={conversation.id}
              customerEmail={conversation.customer?.email ?? null}
            />
          )}
        </section>

        <aside className="space-y-6">
          <Panel className="p-4">
            <h2 className="eyebrow">Customer</h2>
            {conversation.customer ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium">{conversation.customer.name ?? 'Anonymised'}</p>
                {conversation.customer.email && <p className="text-ink-2">{conversation.customer.email}</p>}
                {conversation.customer.phone && (
                  <p className="tabular font-mono text-[0.8125rem] text-ink-2">
                    {conversation.customer.phone}
                  </p>
                )}
                <Link
                  href={`/app/customers/${conversation.customer.id}`}
                  className="inline-flex items-center gap-1 pt-1 text-xs text-pine-700 hover:underline"
                >
                  Customer history <IconArrowRight className="size-3" />
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-3">Anonymous visitor — no contact details shared.</p>
            )}
          </Panel>

          {canReply && (
            <Panel className="p-4">
              <AssignSelect
                conversationId={conversation.id}
                current={conversation.assigneeId}
                team={team.map((m) => ({ id: m.id, name: m.user.name }))}
              />
            </Panel>
          )}

          {conversation.bookings.length > 0 && (
            <Panel className="p-4">
              <h2 className="eyebrow">Bookings from this conversation</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {conversation.bookings.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/app/bookings/${booking.id}`}
                      className="flex items-center justify-between gap-2 hover:underline"
                    >
                      <span>
                        <span className="block">{booking.service.name}</span>
                        <span className="font-mono text-[0.6875rem] text-ink-3">
                          {booking.reference} · {formatInZone(booking.startsAt, tz, 'd MMM HH:mm')}
                        </span>
                      </span>
                      <BookingStatusBadge status={booking.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {conversation.leads.length > 0 && (
            <Panel className="p-4">
              <h2 className="eyebrow">Leads</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {conversation.leads.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-2">
                    <Link href="/app/leads" className="hover:underline">
                      {lead.service?.name ?? 'Quote request'}
                    </Link>
                    <LeadStatusBadge status={lead.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {conversation.tasks.length > 0 && (
            <Panel className="p-4">
              <h2 className="eyebrow">Tasks</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {conversation.tasks.map((task) => (
                  <li key={task.id} className={cx(task.status === 'DONE' && 'text-ink-3 line-through')}>
                    {task.title}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
