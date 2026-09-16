#!/usr/bin/env node
/**
 * Starts Relay for the Playwright browser tests (called by playwright.config.ts).
 *
 *  1. points every database variable at the separate `relay_e2e` database,
 *  2. starts local PostgreSQL, migrates, grants the app role and seeds fresh demo data,
 *  3. builds the app (skip with E2E_SKIP_BUILD=1 when nothing changed) and runs `next start`.
 *
 * Browser tests therefore run against a production build and never touch your dev data.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = process.env.E2E_PORT ?? '3100';

process.loadEnvFile(path.join(ROOT, '.env'));
for (const key of ['E2E_DATABASE_URL', 'E2E_DATABASE_OWNER_URL']) {
  if (!process.env[key]) throw new Error(`${key} is missing from .env. Run "npm run setup".`);
}

const env = {
  ...process.env,
  DATABASE_URL: process.env.E2E_DATABASE_URL,
  DATABASE_OWNER_URL: process.env.E2E_DATABASE_OWNER_URL,
  APP_URL: `http://localhost:${PORT}`,
  DEMO_MODE: 'true',
  PRISMA_HIDE_UPDATE_MESSAGE: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
};

function run(args, extra = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...env, ...extra },
  });
  if (result.status !== 0) throw new Error(`e2e setup failed: node ${args.join(' ')}`);
}

const prisma = path.join('node_modules', 'prisma', 'build', 'index.js');
const next = path.join('node_modules', 'next', 'dist', 'bin', 'next');
const database = new URL(env.DATABASE_URL).pathname.slice(1);

run(['scripts/db.mjs', 'start', '--quiet']);
run([prisma, 'migrate', 'deploy']);
run(['scripts/db.mjs', 'grant', `--database=${database}`, '--quiet']);
run(['--conditions=react-server', '--import', 'tsx', 'prisma/seed.ts']);
if (process.env.E2E_SKIP_BUILD !== '1') run([next, 'build'], { NODE_ENV: 'production' });

const server = spawn(process.execPath, [next, 'start', '--port', PORT], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...env, NODE_ENV: 'production' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
