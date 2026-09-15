import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI (migrate, studio) connects as the table owner.
// The running app uses DATABASE_URL (restricted role) — see src/lib/db.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_OWNER_URL'),
  },
});
