import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { AppError } from '@/lib/errors';
import { authorize, isAllowed, type MemberContext } from '@/modules/tenancy/context';
import { listMembershipsForUser } from '@/modules/tenancy/organizations';
import type { Permission } from '@/modules/tenancy/permissions';
import { getCurrentSession } from './session';

/**
 * Resolves "who is this and which business are they working in" for dashboard requests.
 * Built only from the verified session cookie and the memberships table — nothing the browser
 * sends can choose the organization.
 */
export const getDashboardContext = cache(async () => {
  const session = await getCurrentSession();
  if (!session) return { status: 'signed-out' as const };

  const memberships = await listMembershipsForUser(session.user.id);
  if (memberships.length === 0) return { status: 'no-organization' as const, session };

  const active =
    memberships.find((m) => m.organization.id === session.activeOrganizationId) ?? memberships[0]!;
  const ctx: MemberContext = {
    kind: 'member',
    organizationId: active.organization.id,
    userId: session.user.id,
    membershipId: active.id,
    role: active.role,
    name: session.user.name,
  };
  return {
    status: 'ok' as const,
    session,
    ctx,
    organization: active.organization,
    memberships,
  };
});

export type DashboardContext = Extract<Awaited<ReturnType<typeof getDashboardContext>>, { status: 'ok' }>;

/** For pages: redirects to login or onboarding when needed. */
export async function requireDashboard(): Promise<DashboardContext> {
  const result = await getDashboardContext();
  if (result.status === 'signed-out') redirect('/login');
  if (result.status === 'no-organization') redirect('/onboarding');
  return result;
}

/** For pages: returns whether the current member may see a section (render an access notice if not). */
export async function pageAccess(permission: Permission) {
  const dashboard = await requireDashboard();
  return { dashboard, allowed: isAllowed(dashboard.ctx, permission) };
}

/** For server actions: throws instead of redirecting, so the action can return a clean error. */
export async function requireMember(permission?: Permission): Promise<MemberContext> {
  const result = await getDashboardContext();
  if (result.status !== 'ok')
    throw new AppError('UNAUTHENTICATED', 'Your session has ended. Please log in again.');
  if (permission) authorize(result.ctx, permission);
  return result.ctx;
}
