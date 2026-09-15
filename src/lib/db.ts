import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@/generated/prisma/client';
import { env } from './env';

/**
 * Database access.
 *
 * `prisma` is the raw client. Only the identity/tenancy modules (users, sessions,
 * organizations, memberships) and the rate limiter use it directly, because those tables
 * are read before an organization is known.
 *
 * Everything that belongs to a business goes through `withTenant`, which runs the work in a
 * transaction and first tells PostgreSQL which organization it is for. Row-level security
 * policies then hide every other organization's rows (see the tenant_isolation migration).
 */

const globalForPrisma = globalThis as unknown as { relayPrisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 });
  return new PrismaClient({
    adapter,
    // Tests trigger constraint violations on purpose; logging them would only add noise.
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : env.NODE_ENV === 'test' ? [] : ['error'],
  });
}

// Reuse one client across hot reloads in development instead of opening new pools.
export const prisma = globalForPrisma.relayPrisma ?? createClient();
if (env.NODE_ENV !== 'production') globalForPrisma.relayPrisma = prisma;

declare const tenantBrand: unique symbol;

/**
 * A transaction client that is known to have `app.org_id` set.
 * The brand makes it a type error to pass the raw `prisma` client where tenant access is expected.
 */
export type TenantDb = Prisma.TransactionClient & { readonly [tenantBrand]: true };

export interface TenantScope {
  readonly organizationId: string;
  readonly db: TenantDb;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// #region learn:with-tenant
export async function withTenant<T>(
  organizationId: string,
  work: (scope: TenantScope) => Promise<T>,
): Promise<T> {
  if (!UUID.test(organizationId)) throw new Error('withTenant: organizationId must be a UUID');

  return prisma.$transaction(
    async (tx) => {
      // `true` = local to this transaction, so a pooled connection never leaks the setting
      // into the next request that happens to reuse it.
      await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
      return work({ organizationId, db: tx as TenantDb });
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
}
// #endregion learn:with-tenant

/** PostgreSQL error code for exclusion-constraint violations (used for double-booking). */
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * Extracts the underlying PostgreSQL SQLSTATE code from a Prisma error, if any.
 * With driver adapters, Prisma wraps it as `meta.driverAdapterError.cause.originalCode`;
 * Prisma's own codes (P2xxx) are skipped.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const node = current as { originalCode?: unknown; code?: unknown; cause?: unknown; meta?: unknown };
    for (const value of [node.originalCode, node.code]) {
      if (typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) && !/^P\d{4}$/.test(value)) return value;
    }
    const meta = node.meta as { driverAdapterError?: unknown } | undefined;
    current = meta?.driverAdapterError ?? node.cause;
  }
  return undefined;
}
