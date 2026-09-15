import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_EXCLUSION_VIOLATION, postgresErrorCode, prisma, withTenant } from '@/lib/db';
import { resetDatabase } from '../support/database';

/**
 * These tests talk to PostgreSQL through the same restricted role the app uses, and prove the
 * guarantees that hold even if application code has a bug.
 */
describe('database-level guarantees', () => {
  let orgA: string;
  let orgB: string;
  let serviceA: string;
  let serviceB: string;
  let staffA: string;
  let customerA: string;

  beforeAll(async () => {
    await resetDatabase();
    orgA = (await prisma.organization.create({ data: { slug: 'org-a', name: 'Org A' } })).id;
    orgB = (await prisma.organization.create({ data: { slug: 'org-b', name: 'Org B' } })).id;

    ({ serviceA, staffA, customerA } = await withTenant(orgA, async ({ db, organizationId }) => {
      const service = await db.service.create({
        data: { organizationId, name: 'Standard service', durationMinutes: 60 },
      });
      const staff = await db.staffMember.create({ data: { organizationId, displayName: 'Ingrid' } });
      const customer = await db.customer.create({ data: { organizationId, email: 'kari@example.com' } });
      return { serviceA: service.id, staffA: staff.id, customerA: customer.id };
    }));
    serviceB = await withTenant(orgB, async ({ db, organizationId }) => {
      const service = await db.service.create({
        data: { organizationId, name: 'Haircut', durationMinutes: 30 },
      });
      return service.id;
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs the app as a role that cannot bypass row-level security', async () => {
    const [role] = await prisma.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }[]
    >`
      SELECT r.rolsuper, r.rolbypassrls,
             EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owns_tables
      FROM pg_roles r WHERE r.rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, owns_tables: false });
  });

  it('hides other organizations’ rows even when the query forgets to filter', async () => {
    const seenFromB = await withTenant(orgB, ({ db }) => db.service.findMany());
    expect(seenFromB.map((s) => s.id)).toEqual([serviceB]);

    // Explicitly asking for org A's rows from org B's context still returns nothing.
    const explicit = await withTenant(orgB, ({ db }) =>
      db.service.findMany({ where: { organizationId: orgA } }),
    );
    expect(explicit).toEqual([]);
  });

  it('returns nothing at all when no organization is set (fails closed)', async () => {
    expect(await prisma.service.findMany()).toEqual([]);
  });

  it('refuses to write a row into another organization', async () => {
    await expect(
      withTenant(orgB, ({ db }) =>
        db.service.create({ data: { organizationId: orgA, name: 'Sneaky', durationMinutes: 30 } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses references to another organization’s rows (composite foreign keys)', async () => {
    const start = new Date('2026-10-01T08:00:00Z');
    await expect(
      withTenant(orgA, ({ db, organizationId }) =>
        db.booking.create({
          data: {
            organizationId,
            reference: 'EK-XORG',
            serviceId: serviceB, // belongs to org B
            staffMemberId: staffA,
            customerId: customerA,
            startsAt: start,
            endsAt: new Date(start.getTime() + 3_600_000),
            status: 'CONFIRMED',
            origin: 'DASHBOARD',
          },
        }),
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('makes overlapping bookings for the same staff member impossible', async () => {
    const booking = (
      reference: string,
      startIso: string,
      endIso: string,
      status: 'CONFIRMED' | 'CANCELLED',
    ) =>
      withTenant(orgA, ({ db, organizationId }) =>
        db.booking.create({
          data: {
            organizationId,
            reference,
            serviceId: serviceA,
            staffMemberId: staffA,
            customerId: customerA,
            startsAt: new Date(startIso),
            endsAt: new Date(endIso),
            status,
            origin: 'DASHBOARD',
          },
        }),
      );

    await booking('EK-0001', '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z', 'CONFIRMED');
    const overlap = await booking(
      'EK-0002',
      '2026-10-02T08:30:00Z',
      '2026-10-02T09:30:00Z',
      'CONFIRMED',
    ).catch((e: unknown) => e);
    expect(postgresErrorCode(overlap)).toBe(PG_EXCLUSION_VIOLATION);

    // Back-to-back is fine, and cancelled bookings do not hold the slot.
    await expect(
      booking('EK-0003', '2026-10-02T09:00:00Z', '2026-10-02T10:00:00Z', 'CONFIRMED'),
    ).resolves.toBeTruthy();
    await expect(
      booking('EK-0004', '2026-10-02T08:15:00Z', '2026-10-02T08:45:00Z', 'CANCELLED'),
    ).resolves.toBeTruthy();
  });

  it('keeps the audit log append-only for the app role', async () => {
    const entry = await withTenant(orgA, ({ db, organizationId }) =>
      db.auditLog.create({
        data: {
          organizationId,
          actorType: 'SYSTEM',
          actorLabel: 'Test',
          action: 'test.recorded',
          entityType: 'Test',
          entityId: randomUUID(),
          result: 'SUCCESS',
        },
      }),
    );
    await expect(
      withTenant(orgA, ({ db }) =>
        db.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withTenant(orgA, ({ db }) => db.auditLog.delete({ where: { id: entry.id } })),
    ).rejects.toThrow(/permission denied/i);
  });
});
