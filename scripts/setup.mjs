#!/usr/bin/env node
/**
 * One-command local setup: `npm run setup`
 *  1. creates .env with random local secrets (if missing)
 *  2. creates/starts the local PostgreSQL cluster and roles
 *  3. generates the Prisma client
 *  4. migrates the dev, test and e2e databases and grants the app role
 *  5. seeds the dev database with the demo business
 * Safe to re-run: every step is idempotent except seeding, which resets demo data.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const skipSeed = process.argv.includes('--skip-seed');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Relay needs Node.js 22.12 or newer (you have ${process.versions.node}).`);
  process.exit(1);
}

step('Environment file');
ensureEnvFile();
process.loadEnvFile(path.join(ROOT, '.env'));

step('Local PostgreSQL');
node(['scripts/db.mjs', 'start']);

step('Prisma client');
node([prismaCli(), 'generate']);

for (const [label, ownerUrlKey, appUrlKey] of [
  ['dev', 'DATABASE_OWNER_URL', 'DATABASE_URL'],
  ['test', 'TEST_DATABASE_OWNER_URL', 'TEST_DATABASE_URL'],
  ['e2e', 'E2E_DATABASE_OWNER_URL', 'E2E_DATABASE_URL'],
]) {
  step(`Migrate ${label} database`);
  const env = { DATABASE_OWNER_URL: process.env[ownerUrlKey], DATABASE_URL: process.env[appUrlKey] };
  node([prismaCli(), 'migrate', 'deploy'], env);
  const dbName = new URL(process.env[appUrlKey]).pathname.slice(1);
  node(['scripts/db.mjs', 'grant', `--database=${dbName}`, '--quiet']);
}

if (!skipSeed) {
  step('Seed demo data');
  // react-server condition: lets the seed import app modules marked `server-only`.
  node(['--conditions=react-server', '--import', 'tsx', 'prisma/seed.ts']);
}

console.log(`
Relay is set up.

  npm run dev        start the app on ${process.env.APP_URL ?? 'http://localhost:3000'}
  npm run db:stop    stop the local database when you are done
`);

// ---------------------------------------------------------------------------

function step(title) {
  console.log(`\n▸ ${title}`);
}

function prismaCli() {
  return path.join('node_modules', 'prisma', 'build', 'index.js');
}

function node(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\nSetup stopped: "node ${args.join(' ')}" failed.`);
    process.exit(result.status ?? 1);
  }
}

function ensureEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    console.log('  .env already exists — keeping it.');
    return;
  }
  const template = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const secrets = new Map();
  const filled = template.replace(/CHANGE_ME_[A-Z_]+/g, (token) => {
    if (!secrets.has(token)) secrets.set(token, randomBytes(24).toString('hex'));
    return secrets.get(token);
  });
  fs.writeFileSync(envPath, filled, { mode: 0o600 });
  console.log(`  Created .env with ${secrets.size} random local secrets.`);
}
