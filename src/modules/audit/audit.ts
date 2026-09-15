import 'server-only';
import { z } from 'zod';
import type { ActorType, AuditResult } from '@/generated/prisma/enums';
import type { TenantScope } from '@/lib/db';

/**
 * The audit log answers "who did what, to what, and did it work?" for significant actions —
 * including those taken by the assistant and by automations, not only by people.
 *
 * Entries are written inside the same transaction as the change they describe, so a change
 * is never committed without its audit record (and vice versa).
 * The app's database role can insert and read audit rows but never update or delete them.
 */
export interface Actor {
  type: ActorType;
  id?: string | null;
  label: string;
}

export const SYSTEM_ACTOR: Actor = { type: 'SYSTEM', label: 'Relay' };
export const ASSISTANT_ACTOR: Actor = { type: 'ASSISTANT', label: 'Relay assistant' };
export const customerActor = (customerId?: string | null): Actor => ({
  type: 'CUSTOMER',
  id: customerId ?? null,
  label: 'Customer',
});
export const automationActor = (automation: { id: string; name: string }): Actor => ({
  type: 'AUTOMATION',
  id: automation.id,
  label: `Automation: ${automation.name}`,
});

/**
 * Metadata may only contain identifiers, enums, numbers and short machine values —
 * never free text written by customers, emails or phone numbers.
 */
const metadataValue = z.union([
  z
    .string()
    .max(120)
    .regex(/^[^@]*$/, 'Audit metadata must not contain email addresses'),
  z.number(),
  z.boolean(),
  z.null(),
]);
const metadataSchema = z.record(z.string(), z.union([metadataValue, z.array(metadataValue).max(20)]));

export type AuditMetadata = z.infer<typeof metadataSchema>;

export interface AuditEntry {
  actor: Actor;
  action: string;
  entityType: string;
  entityId?: string | null;
  result?: AuditResult;
  metadata?: AuditMetadata;
}

// #region learn:audit-record
export async function recordAudit({ db, organizationId }: TenantScope, entry: AuditEntry): Promise<void> {
  const metadata = metadataSchema.parse(entry.metadata ?? {});
  await db.auditLog.create({
    data: {
      organizationId,
      actorType: entry.actor.type,
      actorId: entry.actor.id ?? null,
      actorLabel: entry.actor.label,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      result: entry.result ?? 'SUCCESS',
      metadata,
    },
  });
}
// #endregion learn:audit-record

export interface AuditQuery {
  entityType?: string;
  actorType?: ActorType;
  result?: AuditResult;
  before?: Date;
  limit?: number;
}

export async function listAuditLog({ db, organizationId }: TenantScope, query: AuditQuery = {}) {
  return db.auditLog.findMany({
    where: {
      organizationId,
      entityType: query.entityType,
      actorType: query.actorType,
      result: query.result,
      createdAt: query.before ? { lt: query.before } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(query.limit ?? 50, 200),
  });
}

export async function listAuditForEntity(
  { db, organizationId }: TenantScope,
  entityType: string,
  entityId: string,
) {
  return db.auditLog.findMany({
    where: { organizationId, entityType, entityId },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
}
