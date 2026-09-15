import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import type { TenantScope } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/modules/audit/audit';
import type { CustomerDetails } from './schemas';
export { customerDetailsSchema, phoneSchema, type CustomerDetails } from './schemas';
import { actorOf, authorize, type ActorContext } from '@/modules/tenancy/context';

/**
 * Finds a customer by email within the organization, or creates one.
 * Existing details are only filled in, never blanked, so a returning customer who skips the
 * phone field keeps the number they gave last time.
 */
export async function upsertCustomer({ db, organizationId }: TenantScope, details: CustomerDetails) {
  const existing = await db.customer.findUnique({
    where: { organizationId_email: { organizationId, email: details.email } },
  });
  if (existing) {
    const updated = await db.customer.update({
      where: { id: existing.id },
      data: {
        name: details.name || existing.name,
        phone: details.phone || existing.phone,
        anonymisedAt: null,
      },
    });
    return { customer: updated, isNew: false };
  }
  const customer = await db.customer.create({
    data: { organizationId, name: details.name, email: details.email, phone: details.phone || null },
  });
  return { customer, isNew: true };
}

export async function isReturningCustomer(
  { db, organizationId }: TenantScope,
  customerId: string | null | undefined,
) {
  if (!customerId) return false;
  const bookings = await db.booking.count({
    where: {
      organizationId,
      customerId,
      status: { in: ['CONFIRMED', 'CANCELLED'] },
      startsAt: { lt: new Date() },
    },
  });
  return bookings > 0;
}

export async function listCustomers(
  scope: TenantScope,
  ctx: ActorContext,
  query: { search?: string; take?: number } = {},
) {
  authorize(ctx, 'customers.view');
  const search = query.search?.trim();
  return scope.db.customer.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search.replace(/\s/g, '') } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(query.take ?? 50, 200),
    include: {
      _count: { select: { bookings: true, conversations: true, leads: true } },
    },
  });
}

export async function getCustomer(scope: TenantScope, ctx: ActorContext, customerId: string) {
  authorize(ctx, 'customers.view');
  const customer = await scope.db.customer.findFirst({
    where: { id: customerId, organizationId: scope.organizationId },
    include: {
      bookings: { orderBy: { startsAt: 'desc' }, take: 20, include: { service: { select: { name: true } } } },
      conversations: { orderBy: { lastMessageAt: 'desc' }, take: 20 },
      leads: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.');
  return customer;
}

/**
 * Erases a customer's personal data on request. Rows are kept but anonymised, so booking
 * counts and analytics stay correct while the person can no longer be identified.
 * (A deliberate product decision — not a claim of legal compliance.)
 */
// #region learn:erase-customer
export async function eraseCustomer(scope: TenantScope, ctx: ActorContext, customerId: string) {
  authorize(ctx, 'customers.erase');
  const { db, organizationId } = scope;
  const customer = await db.customer.findFirst({ where: { id: customerId, organizationId } });
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.');

  await db.customer.update({
    where: { id: customer.id },
    data: { name: null, email: null, phone: null, anonymisedAt: new Date() },
  });
  await db.message.updateMany({
    where: { organizationId, conversation: { customerId: customer.id }, author: 'CUSTOMER' },
    data: { body: '[removed at the customer’s request]', understanding: Prisma.DbNull },
  });
  await db.booking.updateMany({
    where: { organizationId, customerId: customer.id },
    data: { notes: null, manageTokenHash: null },
  });
  await db.lead.updateMany({
    where: { organizationId, customerId: customer.id },
    data: { summary: '[removed at the customer’s request]' },
  });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'customer.erased',
    entityType: 'Customer',
    entityId: customer.id,
  });
}
// #endregion learn:erase-customer
