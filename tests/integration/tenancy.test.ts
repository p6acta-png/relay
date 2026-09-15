import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@/lib/db';
import { createOrganizationForOwner } from '@/modules/tenancy/organizations';
import {
  acceptInvite,
  changeMemberRole,
  createInvite,
  findInvite,
  removeMember,
} from '@/modules/tenancy/team';
import { resetDatabase } from '../support/database';
import { addMember, createBusiness, createUser } from '../support/factories';

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('onboarding', () => {
  it('creates a ready-to-book business in one step', async () => {
    const { organization, ctx } = await createBusiness({
      saturdayOpen: 'yes',
      saturdayOpens: '10:00',
      saturdayCloses: '14:00',
    });

    const setup = await withTenant(organization.id, async ({ db }) => ({
      staff: await db.staffMember.findMany({ include: { workingHours: true, services: true } }),
      services: await db.service.findMany(),
      audit: await db.auditLog.findMany(),
    }));
    expect(setup.staff).toHaveLength(1);
    expect(setup.staff[0]!.membershipId).toBe(ctx.membershipId);
    expect(setup.staff[0]!.workingHours.map((h) => h.weekday).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(setup.services[0]).toMatchObject({
      name: 'Standard service',
      durationMinutes: 60,
      priceMinor: 99000,
    });
    expect(setup.staff[0]!.services).toHaveLength(1);
    expect(setup.audit.map((a) => a.action)).toContain('organization.created');
  });

  it('rolls everything back when the web address is taken', async () => {
    const { organization } = await createBusiness();
    const user = await createUser();
    const before = await prisma.organization.count();
    await expect(
      createOrganizationForOwner(user, {
        businessName: 'Copycat',
        slug: organization.slug,
        weekdayOpens: '08:00',
        weekdayCloses: '16:00',
        serviceName: 'Service',
        serviceDurationMinutes: 30,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', fieldErrors: { slug: expect.any(String) } });
    expect(await prisma.organization.count()).toBe(before);
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(0);
  });

  it('validates opening hours', async () => {
    const user = await createUser();
    await expect(
      createOrganizationForOwner(user, {
        businessName: 'Backwards',
        slug: 'backwards-hours',
        weekdayOpens: '16:00',
        weekdayCloses: '08:00',
        serviceName: 'Service',
        serviceDurationMinutes: 30,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { weekdayCloses: expect.any(String) } });
  });
});

describe('team invitations', () => {
  it('invites, emails (demo outbox) and accepts a new staff member', async () => {
    const { organization, ctx } = await createBusiness();
    const invitee = await createUser({ email: 'jonas.haugen@example.com' });

    const { url } = await createInvite(ctx, { email: 'Jonas.Haugen@example.com', role: 'STAFF' });
    const token = url.split('/invite/')[1]!;

    const outbox = await withTenant(organization.id, ({ db }) => db.outboundEmail.findMany());
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ toAddress: 'jonas.haugen@example.com', status: 'STORED_IN_OUTBOX' });
    expect(outbox[0]!.textBody).toContain(url);

    await acceptInvite(token, invitee);
    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: invitee.id } });
    expect(membership).toMatchObject({ organizationId: organization.id, role: 'STAFF' });
    expect((await findInvite(token))?.status).toBe('accepted');
    await expect(acceptInvite(token, invitee)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses an invitation used by a different email address', async () => {
    const { ctx } = await createBusiness();
    const stranger = await createUser();
    const { url } = await createInvite(ctx, { email: 'intended@example.com', role: 'STAFF' });
    await expect(acceptInvite(url.split('/invite/')[1]!, stranger)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('does not let staff invite anyone', async () => {
    const { organization } = await createBusiness();
    const staff = await addMember(organization.id, 'STAFF');
    await expect(
      createInvite(staff.ctx, { email: 'friend@example.com', role: 'STAFF' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('roles', () => {
  it('stops admins from changing an owner and keeps at least one owner', async () => {
    const { organization, ctx: ownerCtx } = await createBusiness();
    const admin = await addMember(organization.id, 'ADMIN');

    await expect(changeMemberRole(admin.ctx, ownerCtx.membershipId, 'STAFF')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(changeMemberRole(ownerCtx, ownerCtx.membershipId, 'ADMIN')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(removeMember(ownerCtx, ownerCtx.membershipId)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('lets an admin promote staff and records it in the audit log', async () => {
    const { organization } = await createBusiness();
    const admin = await addMember(organization.id, 'ADMIN');
    const staff = await addMember(organization.id, 'STAFF');

    await changeMemberRole(admin.ctx, staff.membership.id, 'ADMIN');
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: staff.membership.id } })).role).toBe(
      'ADMIN',
    );

    const audit = await withTenant(organization.id, ({ db }) =>
      db.auditLog.findFirstOrThrow({ where: { action: 'membership.role_changed' } }),
    );
    expect(audit).toMatchObject({
      actorType: 'USER',
      actorId: admin.user.id,
      metadata: { from: 'STAFF', to: 'ADMIN' },
    });
  });

  it('cannot reach another organization’s members', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    await expect(changeMemberRole(a.ctx, b.ctx.membershipId, 'STAFF')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
