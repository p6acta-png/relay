import pg from 'pg';

/** Owner-role connection for test housekeeping only (the app never uses the owner role). */
async function withOwner<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Empties every application table so each test file starts from a clean database. */
export async function resetDatabase(): Promise<void> {
  await withOwner(async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length === 0) return;
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
    await client.query(`TRUNCATE ${tables} CASCADE`);
  });
}
