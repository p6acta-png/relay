import 'server-only';
import { z } from 'zod';
import type { TenantScope } from '@/lib/db';

/**
 * Email boundary.
 *
 * Relay never sends email in the middle of handling a request. Instead, every email is written
 * to the OutboundEmail table in the same transaction as the change that caused it
 * (the "transactional outbox" pattern). A delivery worker would then hand queued messages to
 * an `EmailProvider` and mark them SENT or FAILED — so a slow or failing email service can
 * never break a booking.
 *
 * This build ships only the demo provider: messages stay in the outbox, are shown in the
 * dashboard under Setup → Email outbox, and are clearly labelled as not delivered.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  related?: { type: string; id: string };
}

export interface EmailProvider {
  readonly name: string;
  /** True when messages are never actually delivered. */
  readonly isDemo: boolean;
  deliver(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

export const demoEmailProvider: EmailProvider = {
  name: 'demo-outbox',
  isDemo: true,
  async deliver() {
    throw new Error('The demo email provider does not deliver email. Messages stay in the outbox.');
  },
};

export function getEmailProvider(): EmailProvider {
  return demoEmailProvider;
}

const messageSchema = z.object({
  to: z.email().max(254),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(10_000),
  related: z.object({ type: z.string().max(40), id: z.uuid() }).optional(),
});

// #region learn:queue-email
export async function queueEmail({ db, organizationId }: TenantScope, message: EmailMessage) {
  const parsed = messageSchema.parse(message);
  const provider = getEmailProvider();
  return db.outboundEmail.create({
    data: {
      organizationId,
      toAddress: parsed.to.toLowerCase(),
      subject: parsed.subject,
      textBody: parsed.text,
      provider: provider.name,
      status: provider.isDemo ? 'STORED_IN_OUTBOX' : 'QUEUED',
      relatedType: parsed.related?.type,
      relatedId: parsed.related?.id,
    },
    select: { id: true, status: true },
  });
}
// #endregion learn:queue-email

export async function listOutbox({ db, organizationId }: TenantScope, limit = 50) {
  return db.outboundEmail.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
