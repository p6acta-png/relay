import 'server-only';
import type { Role } from '@/generated/prisma/enums';
import type { TenantScope } from '@/lib/db';

/** In-app notifications for team members (the bell in the dashboard header). */
export type Recipients = { membershipIds: string[] } | { roles: Role[] };

export interface NotificationInput {
  title: string;
  body?: string;
  href?: string;
}

export async function resolveRecipients(
  { db, organizationId }: TenantScope,
  recipients: Recipients,
): Promise<string[]> {
  // Memberships are not under RLS, so the organization filter here is essential.
  // Use the transaction client, not the global one: a second pooled connection inside a
  // transaction can exhaust the pool under load.
  const memberships = await db.membership.findMany({
    where:
      'roles' in recipients
        ? { organizationId, role: { in: recipients.roles } }
        : { organizationId, id: { in: recipients.membershipIds } },
    select: { id: true },
  });
  return memberships.map((m) => m.id);
}

export async function notify(scope: TenantScope, recipients: Recipients, input: NotificationInput) {
  const membershipIds = await resolveRecipients(scope, recipients);
  if (membershipIds.length === 0) return 0;
  const result = await scope.db.notification.createMany({
    data: membershipIds.map((membershipId) => ({
      organizationId: scope.organizationId,
      membershipId,
      title: input.title.slice(0, 160),
      body: (input.body ?? '').slice(0, 500),
      href: input.href?.startsWith('/app/') ? input.href : null,
    })),
  });
  return result.count;
}

export async function listNotifications(
  { db, organizationId }: TenantScope,
  membershipId: string,
  limit = 15,
) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { organizationId, membershipId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    db.notification.count({ where: { organizationId, membershipId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markAllRead({ db, organizationId }: TenantScope, membershipId: string) {
  await db.notification.updateMany({
    where: { organizationId, membershipId, readAt: null },
    data: { readAt: new Date() },
  });
}
