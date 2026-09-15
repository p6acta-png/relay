import 'server-only';
import { prisma, type TenantScope } from '@/lib/db';
import type { Names } from '@/modules/automations/describe';

/** Service and team names for the builder's pickers and for reading automations as sentences. */
export async function loadBuilderOptions(scope: TenantScope) {
  const services = await scope.db.service.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true, name: true, active: true },
  });
  // Memberships are read with an explicit organization filter (not under RLS).
  const members = await prisma.membership.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, user: { select: { name: true } } },
  });
  const names: Names = {
    services: Object.fromEntries(services.map((s) => [s.id, s.name])),
    members: Object.fromEntries(members.map((m) => [m.id, m.user.name])),
  };
  return {
    names,
    services: services.map((s) => ({ id: s.id, name: s.name, active: s.active })),
    members: members.map((m) => ({ id: m.id, name: m.user.name, role: m.role })),
  };
}
