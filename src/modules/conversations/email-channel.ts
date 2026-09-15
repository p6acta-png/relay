import 'server-only';
import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { localMinutesOfDay, toLocalDate } from '@/lib/time';
import { understand } from '@/modules/assistant/provider';
import { runAutomations } from '@/modules/automations/engine';
import { describeOpeningHours, parseOpeningHours } from '@/modules/catalog/opening-hours';
import { upsertCustomer } from '@/modules/customers/customers';
import { emailSchema } from '@/modules/auth/schemas';
import type { DomainEvent } from '@/modules/events';
import { queueEmail } from '@/modules/notifications/email';
import { authorize, type AssistantContext, type MemberContext } from '@/modules/tenancy/context';
import { addMessage, createConversation, handOffConversation } from './conversations';
import { formatPrice } from './flow';

/**
 * The email channel, simulated.
 *
 * In production a provider's inbound webhook would call `receiveEmail`. In this build a team
 * member pastes an email into Setup → Email outbox, marked "Demo mode". Everything after that is
 * real: the same AI boundary, the same knowledge base, the same hand-off and automations as chat.
 *
 * Email is not interactive, so Relay only answers questions it can answer from settings or the FAQ.
 * Bookings, quotes and anything else go to a person — honest, and safer than guessing by email.
 */
export const inboundEmailSchema = z.object({
  fromName: z.string().trim().min(2, 'Enter the sender’s name.').max(80),
  fromEmail: emailSchema,
  subject: z.string().trim().min(1, 'Add a subject.').max(150),
  body: z.string().trim().min(3, 'Write the email text.').max(4000),
});

// #region learn:email-channel
export async function receiveDemoEmail(ctx: MemberContext, raw: z.input<typeof inboundEmailSchema>) {
  authorize(ctx, 'setup.manage');
  const parsed = inboundEmailSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError('VALIDATION', 'Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues));
  const email = parsed.data;

  const catalog = await withTenant(ctx.organizationId, async ({ db, organizationId }) => ({
    organization: await db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    services: await db.service.findMany({ where: { organizationId, active: true } }),
    knowledge: await db.knowledgeItem.findMany({ where: { organizationId, published: true } }),
  }));
  const { organization } = catalog;

  // Same AI boundary as chat, outside any transaction.
  const { interpretation, provider, rejected } = await understand({
    message: `${email.subject}\n${email.body}`,
    localNow: {
      date: toLocalDate(new Date(), organization.timezone),
      minute: localMinutesOfDay(new Date(), organization.timezone),
    },
    step: 'idle',
    services: catalog.services.map((s) => ({ id: s.id, name: s.name, kind: s.kind, keywords: s.keywords })),
    knowledge: catalog.knowledge.map((k) => ({ id: k.id, question: k.question, keywords: k.keywords })),
  });

  const answer = (() => {
    if (interpretation.intent !== 'ask_question') return null;
    const item = catalog.knowledge.find((k) => k.id === interpretation.knowledgeItemId);
    if (item) return item.answer;
    if (interpretation.topic === 'opening_hours') {
      return `Our opening hours are:\n${describeOpeningHours(parseOpeningHours(organization.openingHours)).join('\n')}`;
    }
    const service = catalog.services.find((s) => s.id === interpretation.serviceId);
    if (interpretation.topic === 'prices' && service && formatPrice(service)) {
      return `${service.name} costs ${formatPrice(service)}${service.durationMinutes ? ` and takes about ${service.durationMinutes} minutes` : ''}.`;
    }
    return null;
  })();

  const events: DomainEvent[] = [];
  const conversationId = await withTenant(ctx.organizationId, async (scope) => {
    const { customer } = await upsertCustomer(scope, {
      name: email.fromName,
      email: email.fromEmail,
      phone: '',
    });
    const created = await createConversation(scope, {
      channel: 'EMAIL',
      subject: email.subject,
      customerId: customer.id,
    });
    events.push(...created.events);
    const id = created.conversation.id;
    await addMessage(scope, {
      conversationId: id,
      author: 'CUSTOMER',
      body: email.body,
      understanding: { ...interpretation, provider, rejected: rejected ?? null },
    });

    const assistant: AssistantContext = {
      kind: 'assistant',
      organizationId: scope.organizationId,
      conversationId: id,
    };
    const firstName = email.fromName.split(' ')[0];
    if (answer) {
      const reply = `Hi ${firstName},\n\n${answer}\n\nIf that doesn’t answer your question, just reply and someone from ${organization.name} will get back to you.\n\n${organization.name}`;
      await addMessage(scope, { conversationId: id, author: 'ASSISTANT', body: reply });
      await queueEmail(scope, {
        to: email.fromEmail,
        subject: `Re: ${email.subject}`,
        text: reply,
        related: { type: 'Conversation', id },
      });
    } else {
      const handoff = await handOffConversation(scope, assistant, {
        conversationId: id,
        reason: 'unanswered_question',
      });
      events.push(...handoff.events);
      const reply = `Hi ${firstName},\n\nThanks for your email. Someone from ${organization.name} will reply within ${organization.handoffReplyHours} hours.${interpretation.intent === 'book' ? ' If you’d like to pick a time yourself, you can book on our website.' : ''}\n\n${organization.name}`;
      await addMessage(scope, { conversationId: id, author: 'ASSISTANT', body: reply });
      await queueEmail(scope, {
        to: email.fromEmail,
        subject: `Re: ${email.subject}`,
        text: reply,
        related: { type: 'Conversation', id },
      });
    }
    return id;
  });

  await runAutomations(events);
  return { conversationId, answered: Boolean(answer) };
}
// #endregion learn:email-channel
