import 'server-only';
import { z } from 'zod';
import type { Role } from '@/generated/prisma/enums';
import { prisma, transaction, withTenant, enterTenant } from '@/lib/db';
import { env } from '@/lib/env';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { generateToken, hashToken } from '@/lib/tokens';
import { recordAudit } from '@/modules/audit/audit';
import { emailSchema } from '@/modules/auth/schemas';
import type { SessionUser } from '@/modules/auth/sessions';
import { queueEmail } from '@/modules/notifications/email';
import { actorOf, authorize, type MemberContext } from './context';
import { canManageRole, ROLE_LABELS } from './permissions';

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const inviteSchema = z.object({
  email: emailSchema,
  // New people join as admin or staff; ownership is granted later by an existing owner.
  role: z.enum(['ADMIN', 'STAFF']),
});

export async function listTeam(ctx: MemberContext) {
  authorize(ctx, 'team.view');
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.invite.findMany({
      where: {
        organizationId: ctx.organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  ]);
  return { members, invites };
}

// #region learn:invite
export async function createInvite(ctx: MemberContext, input: z.input<typeof inviteSchema>) {
  authorize(ctx, 'team.manage');
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues));
  }
  const { email, role } = parsed.data;
  if (!canManageRole(ctx.role, role))
    throw new AppError('FORBIDDEN', 'You cannot invite someone with that role.');

  const alreadyMember = await prisma.membership.findFirst({
    where: { organizationId: ctx.organizationId, user: { email } },
    select: { id: true },
  });
  if (alreadyMember) {
    throw new AppError('CONFLICT', 'This person is already on the team.', {
      email: 'Already a team member.',
    });
  }

  const token = generateToken();
  const url = `${env.APP_URL}/invite/${token}`;

  const invite = await withTenant(ctx.organizationId, async (scope) => {
    // Only one open invite per email: re-inviting replaces the old link.
    await scope.db.invite.updateMany({
      where: { organizationId: ctx.organizationId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await scope.db.invite.create({
      data: {
        organizationId: ctx.organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: ctx.membershipId,
        expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        organization: { select: { name: true } },
      },
    });
    await queueEmail(scope, {
      to: email,
      subject: `${ctx.name} invited you to ${created.organization.name} on Relay`,
      text: [
        `Hi,`,
        ``,
        `${ctx.name} has invited you to join ${created.organization.name} on Relay as ${ROLE_LABELS[role].toLowerCase()}.`,
        ``,
        `Accept the invitation: ${url}`,
        ``,
        `The link expires in 7 days. If you were not expecting this, you can ignore this email.`,
      ].join('\n'),
      related: { type: 'Invite', id: created.id },
    });
    await recordAudit(scope, {
      actor: actorOf(ctx),
      action: 'invite.created',
      entityType: 'Invite',
      entityId: created.id,
      metadata: { role },
    });
    return created;
  });

  // The raw token is returned once so the dashboard can show a copyable link in demo mode.
  return { invite, url };
}
// #endregion learn:invite

export async function revokeInvite(ctx: MemberContext, inviteId: string) {
  authorize(ctx, 'team.manage');
  await withTenant(ctx.organizationId, async (scope) => {
    const { count } = await scope.db.invite.updateMany({
      where: { id: inviteId, organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new AppError('NOT_FOUND', 'That invitation no longer exists.');
    await recordAudit(scope, {
      actor: actorOf(ctx),
      action: 'invite.revoked',
      entityType: 'Invite',
      entityId: inviteId,
    });
  });
}

export type InviteStatus = 'valid' | 'expired' | 'accepted' | 'revoked';

export async function findInvite(token: string) {
  if (!token || token.length > 100) return null;
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { id: true, name: true } },
    },
  });
  if (!invite) return null;
  const status: InviteStatus = invite.revokedAt
    ? 'revoked'
    : invite.acceptedAt
      ? 'accepted'
      : invite.expiresAt <= new Date()
        ? 'expired'
        : 'valid';
  return { ...invite, status };
}

export async function acceptInvite(token: string, user: SessionUser) {
  const invite = await findInvite(token);
  if (!invite || invite.status !== 'valid') {
    throw new AppError('NOT_FOUND', 'This invitation is no longer valid. Ask for a new one.');
  }
  if (invite.email !== user.email.toLowerCase()) {
    throw new AppError('FORBIDDEN', `This invitation was sent to a different email address.`);
  }

  return transaction(async (tx) => {
    // Mark accepted first with a guard, so two simultaneous clicks cannot both succeed.
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw new AppError('CONFLICT', 'This invitation has already been used.');

    const membership = await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: invite.organization.id, userId: user.id } },
      update: {},
      create: { organizationId: invite.organization.id, userId: user.id, role: invite.role },
    });
    const scope = await enterTenant(tx, invite.organization.id);
    await recordAudit(scope, {
      actor: { type: 'USER', id: user.id, label: user.name },
      action: 'invite.accepted',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { role: membership.role },
    });
    return { membership, organization: invite.organization };
  });
}

async function loadTarget(ctx: MemberContext, membershipId: string) {
  const target = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
    select: { id: true, role: true, userId: true },
  });
  if (!target) throw new AppError('NOT_FOUND', 'Team member not found.');
  return target;
}

async function assertNotLastOwner(organizationId: string, changingRole: Role) {
  if (changingRole !== 'OWNER') return;
  const owners = await prisma.membership.count({ where: { organizationId, role: 'OWNER' } });
  if (owners <= 1) throw new AppError('INVALID_STATE', 'A business needs at least one owner.');
}

export async function changeMemberRole(ctx: MemberContext, membershipId: string, role: Role) {
  authorize(ctx, 'team.manage');
  const target = await loadTarget(ctx, membershipId);
  if (target.role === role) return;
  if (!canManageRole(ctx.role, target.role) || !canManageRole(ctx.role, role)) {
    throw new AppError('FORBIDDEN', 'You cannot change this person’s role.');
  }
  await assertNotLastOwner(ctx.organizationId, target.role);

  await withTenant(ctx.organizationId, async (scope) => {
    await scope.db.membership.update({ where: { id: target.id }, data: { role } });
    await recordAudit(scope, {
      actor: actorOf(ctx),
      action: 'membership.role_changed',
      entityType: 'Membership',
      entityId: target.id,
      metadata: { from: target.role, to: role },
    });
  });
}

export async function removeMember(ctx: MemberContext, membershipId: string) {
  authorize(ctx, 'team.manage');
  const target = await loadTarget(ctx, membershipId);
  if (!canManageRole(ctx.role, target.role))
    throw new AppError('FORBIDDEN', 'You cannot remove this person.');
  await assertNotLastOwner(ctx.organizationId, target.role);

  await withTenant(ctx.organizationId, async (scope) => {
    const { organizationId } = scope;
    // Hand work back to the team before removing the person.
    await scope.db.task.updateMany({
      where: { organizationId, assigneeId: target.id },
      data: { assigneeId: null },
    });
    await scope.db.lead.updateMany({
      where: { organizationId, assigneeId: target.id },
      data: { assigneeId: null },
    });
    await scope.db.conversation.updateMany({
      where: { organizationId, assigneeId: target.id },
      data: { assigneeId: null },
    });
    await scope.db.staffMember.updateMany({
      where: { organizationId, membershipId: target.id },
      data: { membershipId: null },
    });
    await scope.db.notification.deleteMany({ where: { organizationId, membershipId: target.id } });
    // Keep history rows but detach them; who did what stays in the audit log.
    await scope.db.booking.updateMany({
      where: { organizationId, createdByMembershipId: target.id },
      data: { createdByMembershipId: null },
    });
    await scope.db.message.updateMany({
      where: { organizationId, staffMembershipId: target.id },
      data: { staffMembershipId: null },
    });
    await scope.db.automation.updateMany({
      where: { organizationId, createdByMembershipId: target.id },
      data: { createdByMembershipId: null },
    });
    await scope.db.invite.deleteMany({ where: { organizationId, invitedById: target.id } });
    await scope.db.membership.delete({ where: { id: target.id } });
    await recordAudit(scope, {
      actor: actorOf(ctx),
      action: 'membership.removed',
      entityType: 'Membership',
      entityId: target.id,
      metadata: { role: target.role },
    });
  });
}
