import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

function run(args: string[], env: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (result.status !== 0) throw new Error(`Integration setup failed: node ${args.join(' ')}`);
}

/** Once per test run: make sure PostgreSQL is up and the test database schema is current. */
export default function setup() {
  process.loadEnvFile(path.join(root, '.env'));
  const testDb = new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1);
  run(['scripts/db.mjs', 'start', '--quiet']);
  run([path.join('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    DATABASE_OWNER_URL: process.env.TEST_DATABASE_OWNER_URL,
  });
  run(['scripts/db.mjs', 'grant', `--database=${testDb}`, '--quiet']);
}
