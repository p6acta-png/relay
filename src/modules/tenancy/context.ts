import type { Role } from '@/generated/prisma/enums';
import { AppError } from '@/lib/errors';
import type { Actor } from '@/modules/audit/audit';
import { can, machineCan, type Permission } from './permissions';

/**
 * Who is acting, and for which organization.
 *
 * Every service that reads or changes business data receives one of these. The context is
 * always built on the server — from a verified session cookie, from the public URL of a
 * business, or by the automation engine — never from values the browser sends.
 */
export interface MemberContext {
  kind: 'member';
  organizationId: string;
  userId: string;
  membershipId: string;
  role: Role;
  name: string;
}

export interface AssistantContext {
  kind: 'assistant';
  organizationId: string;
  conversationId: string;
}

export interface AutomationContext {
  kind: 'automation';
  organizationId: string;
  automationId: string;
  automationName: string;
}

export interface CustomerContext {
  kind: 'customer';
  organizationId: string;
  customerId: string | null;
}

/** Trusted internal code only: onboarding and seeding. Never built from a request. */
export interface SystemContext {
  kind: 'system';
  organizationId: string;
}

export type ActorContext =
  MemberContext | AssistantContext | AutomationContext | CustomerContext | SystemContext;

// #region learn:authorize
export function isAllowed(ctx: ActorContext, permission: Permission): boolean {
  switch (ctx.kind) {
    case 'member':
      return can(ctx.role, permission);
    case 'assistant':
      return machineCan('ASSISTANT', permission);
    case 'automation':
      return machineCan('AUTOMATION', permission);
    case 'customer':
      return machineCan('CUSTOMER', permission);
    case 'system':
      return true;
  }
}

export function authorize(ctx: ActorContext, permission: Permission): void {
  if (!isAllowed(ctx, permission)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to do that.');
  }
}

/** Like `authorize`, and also proves the actor belongs to the organization the transaction is scoped to. */
export function authorizeIn(
  scope: { organizationId: string },
  ctx: ActorContext,
  permission: Permission,
): void {
  if (scope.organizationId !== ctx.organizationId) {
    // A programming error, never a user error: fail loudly.
    throw new Error('Actor context and tenant scope refer to different organizations.');
  }
  authorize(ctx, permission);
}
// #endregion learn:authorize

export function actorOf(ctx: ActorContext): Actor {
  switch (ctx.kind) {
    case 'member':
      return { type: 'USER', id: ctx.userId, label: ctx.name };
    case 'assistant':
      return { type: 'ASSISTANT', id: null, label: 'Relay assistant' };
    case 'automation':
      return { type: 'AUTOMATION', id: ctx.automationId, label: `Automation: ${ctx.automationName}` };
    case 'customer':
      return { type: 'CUSTOMER', id: ctx.customerId, label: 'Customer' };
    case 'system':
      return { type: 'SYSTEM', id: null, label: 'Relay' };
  }
}
