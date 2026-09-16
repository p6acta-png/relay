#!/usr/bin/env node
/**
 * Local PostgreSQL for development — no Docker, no admin rights.
 *
 * PostgreSQL binaries come from the pinned `@embedded-postgres/<platform>` npm package.
 * We deliberately drive them with PostgreSQL's own `initdb` and `pg_ctl` instead of the
 * `embedded-postgres` JS wrapper: on Windows the wrapper's stop() killed only the main
 * process and orphaned a worker that kept the port open (see DECISIONS.md, ADR-003).
 *
 * Usage: node scripts/db.mjs <start|stop|status|reset|grant> [--yes] [--quiet]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import pg from 'pg';

const ROOT = path.resolve(import.meta.dirname, '..');
const STATE_DIR = path.join(ROOT, '.relay', 'postgres');
const DATA_DIR = path.join(STATE_DIR, 'data');
const SERVER_LOG = path.join(STATE_DIR, 'server.log');
const CTL_LOG = path.join(STATE_DIR, 'pg_ctl.log');
const ADMIN_USER = 'relay_admin';

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) ?? 'status';
const quiet = args.includes('--quiet');
const log = (...m) => {
  if (!quiet) console.log('[db]', ...m);
};

loadEnv();
const config = readConfig();

// ---------------------------------------------------------------------------

function loadEnv() {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
}

function readConfig() {
  const required = ['DATABASE_URL', 'DATABASE_OWNER_URL', 'LOCAL_PG_ADMIN_PASSWORD'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[db] Missing ${missing.join(', ')}. Run "npm run setup" first to create .env.`);
    process.exit(1);
  }
  const app = new URL(process.env.DATABASE_URL);
  const owner = new URL(process.env.DATABASE_OWNER_URL);
  const port = Number(owner.port || 5432);
  if (owner.hostname !== 'localhost' && owner.hostname !== '127.0.0.1') {
    console.error(
      '[db] DATABASE_OWNER_URL does not point at localhost; this script only manages the local database.',
    );
    process.exit(1);
  }
  const databases = ['DATABASE_URL', 'TEST_DATABASE_URL', 'E2E_DATABASE_URL']
    .map((k) => process.env[k])
    .filter(Boolean)
    .map((u) => decodeURIComponent(new URL(u).pathname.slice(1)));
  return {
    port,
    adminPassword: process.env.LOCAL_PG_ADMIN_PASSWORD,
    owner: { user: decodeURIComponent(owner.username), password: decodeURIComponent(owner.password) },
    app: { user: decodeURIComponent(app.username), password: decodeURIComponent(app.password) },
    databases: [...new Set(databases)],
  };
}

let cachedBinDir;
function binDir() {
  if (cachedBinDir) return cachedBinDir;
  const platformPkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  let entry;
  try {
    // The package only exports dist/index.js; its package root is one level above dist/.
    entry = fileURLToPath(import.meta.resolve(platformPkg));
  } catch {
    throw new Error(
      `PostgreSQL binaries for ${process.platform}-${process.arch} are not installed (${platformPkg}). ` +
        'Run "npm install", or point DATABASE_URL at another PostgreSQL server.',
    );
  }
  const nativeDir = path.join(path.dirname(entry), '..', 'native');
  hydrateSymlinks(nativeDir);
  cachedBinDir = path.join(nativeDir, 'bin');
  return cachedBinDir;
}

/** macOS/Linux packages ship shared-library symlinks as a JSON list; recreate them if missing. */
function hydrateSymlinks(nativeDir) {
  const listFile = path.join(nativeDir, 'pg-symlinks.json');
  if (!fs.existsSync(listFile)) return;
  const links = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  for (const { source, target } of links) {
    if (fs.existsSync(target)) continue;
    try {
      fs.symlinkSync(path.relative(path.dirname(target), source), target);
    } catch {
      // Already present or not needed on this platform.
    }
  }
}

function exe(name) {
  return path.join(binDir(), process.platform === 'win32' ? `${name}.exe` : name);
}

/**
 * Runs a PostgreSQL CLI tool. Output goes to a log file rather than a pipe: `pg_ctl start`
 * leaves a long-running server behind, and a server that inherits our pipe would keep
 * spawnSync waiting forever. `detached` keeps the server out of this terminal's Ctrl+C group.
 */
function run(tool, toolArgs) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const fd = fs.openSync(CTL_LOG, 'w');
  const result = spawnSync(exe(tool), toolArgs, {
    stdio: ['ignore', fd, fd],
    detached: true,
    windowsHide: true,
  });
  fs.closeSync(fd);
  const output = fs.readFileSync(CTL_LOG, 'utf8').trim();
  if (result.error) throw result.error;
  return { code: result.status, output };
}

function isInitialised() {
  return fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
}

function isRunning() {
  if (!isInitialised()) return false;
  return run('pg_ctl', ['-D', DATA_DIR, 'status']).code === 0;
}

function initCluster() {
  log('Creating a new local PostgreSQL cluster in .relay/postgres (one-time, ~10 s)…');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const pwFile = path.join(STATE_DIR, '.initdb-pw');
  fs.writeFileSync(pwFile, config.adminPassword, { mode: 0o600 });
  try {
    const { code, output } = run('initdb', [
      '-D',
      DATA_DIR,
      '-U',
      ADMIN_USER,
      `--pwfile=${pwFile}`,
      '--auth-host=scram-sha-256',
      '--auth-local=scram-sha-256',
      '--encoding=UTF8',
      '--locale-provider=builtin',
      '--builtin-locale=C.UTF-8',
    ]);
    if (code !== 0) throw new Error(`initdb failed:\n${output}`);
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
  // Only listen on this machine, on our own port, so we never clash with another PostgreSQL.
  fs.appendFileSync(
    path.join(DATA_DIR, 'postgresql.conf'),
    [
      '',
      '# --- Relay local development settings ---',
      `port = ${config.port}`,
      "listen_addresses = 'localhost'",
      "timezone = 'UTC'",
      'max_connections = 60',
      '',
    ].join('\n'),
  );
}

async function start() {
  if (!isInitialised()) initCluster();
  if (isRunning()) {
    log(`Already running on port ${config.port}.`);
  } else {
    // `-p` from .env wins over the port written at init, so changing .env is enough to move ports.
    const { code, output } = run('pg_ctl', [
      '-D',
      DATA_DIR,
      '-l',
      SERVER_LOG,
      '-o',
      `-p ${config.port}`,
      '-w',
      '-t',
      '60',
      'start',
    ]);
    if (code !== 0) {
      throw new Error(
        `Could not start PostgreSQL.\n${output}\n` +
          `Server log: ${path.relative(ROOT, SERVER_LOG)}\n` +
          `If port ${config.port} is taken, change the port in .env (all *_DATABASE_URL values).`,
      );
    }
    log(`Started on port ${config.port}.`);
  }
  await ensureRolesAndDatabases();
}

function stop() {
  if (!isRunning()) {
    log('Not running.');
    return;
  }
  const { code, output } = run('pg_ctl', ['-D', DATA_DIR, '-w', '-t', '60', 'stop', '-m', 'fast']);
  if (code !== 0) throw new Error(`Could not stop PostgreSQL cleanly:\n${output}`);
  log('Stopped.');
}

function status() {
  if (!isInitialised()) {
    console.log('[db] Not set up yet. Run "npm run setup".');
    return;
  }
  const running = isRunning();
  console.log(`[db] ${running ? 'Running' : 'Stopped'} · port ${config.port} · data in .relay/postgres/data`);
  console.log(`[db] Databases: ${config.databases.join(', ')}`);
  if (!running) process.exitCode = 3;
}

async function reset() {
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY) throw new Error('Refusing to reset without --yes in a non-interactive shell.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      '[db] This deletes ALL local Relay data (dev, test and e2e databases). Type "reset" to continue: ',
    );
    rl.close();
    if (answer.trim() !== 'reset') {
      log('Cancelled.');
      return;
    }
  }
  stop();
  // Guard: only ever delete our own state directory inside the project.
  if (!DATA_DIR.startsWith(path.join(ROOT, '.relay')))
    throw new Error('Unexpected data directory; aborting.');
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  log('Local cluster deleted.');
  await start();
}

async function adminQuery(database, fn) {
  const client = new pg.Client({
    host: 'localhost',
    port: config.port,
    user: ADMIN_USER,
    password: config.adminPassword,
    database,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Two login roles, on purpose:
 *  - owner: owns the tables and runs migrations.
 *  - app:   what the running application uses. Not a superuser, cannot bypass RLS and
 *           does not own tables — so PostgreSQL row-level security always applies to it.
 */
async function ensureRolesAndDatabases() {
  await adminQuery('postgres', async (c) => {
    const lit = (v) => c.escapeLiteral(v);
    const ident = (v) => c.escapeIdentifier(v);
    const roles = [
      { ...config.owner, attrs: 'LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOBYPASSRLS' },
      { ...config.app, attrs: 'LOGIN NOCREATEDB NOSUPERUSER NOCREATEROLE NOBYPASSRLS' },
    ];
    for (const role of roles) {
      const exists = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.user]);
      const verb = exists.rowCount ? 'ALTER' : 'CREATE';
      await c.query(`${verb} ROLE ${ident(role.user)} WITH ${role.attrs} PASSWORD ${lit(role.password)}`);
    }
    for (const db of config.databases) {
      const exists = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
      if (!exists.rowCount) {
        await c.query(`CREATE DATABASE ${ident(db)} OWNER ${ident(config.owner.user)}`);
        log(`Created database ${db}.`);
      }
      await c.query(`GRANT CONNECT ON DATABASE ${ident(db)} TO ${ident(config.app.user)}`);
    }
  });
}

/**
 * Grants the app role access to tables after migrations have run.
 * The audit log is append-only for the app: it may insert and read, never update or delete.
 */
async function grantAppRole() {
  const target = args.find((a) => a.startsWith('--database='))?.split('=')[1];
  const databases = target ? [target] : config.databases;
  for (const db of databases) {
    await adminQuery(db, async (c) => {
      const app = c.escapeIdentifier(config.app.user);
      await c.query(`
        REVOKE ALL ON SCHEMA public FROM PUBLIC;
        GRANT USAGE ON SCHEMA public TO ${app};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app};
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app};
      `);
      const tables = await c.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('AuditLog', '_prisma_migrations')`,
      );
      for (const { tablename } of tables.rows) {
        const t = c.escapeIdentifier(tablename);
        if (tablename === 'AuditLog') await c.query(`REVOKE UPDATE, DELETE, TRUNCATE ON ${t} FROM ${app}`);
        else await c.query(`REVOKE ALL ON ${t} FROM ${app}`);
      }
    });
    log(`Granted app role access in ${db}.`);
  }
}

// ---------------------------------------------------------------------------

try {
  switch (command) {
    case 'start':
      await start();
      break;
    case 'stop':
      stop();
      break;
    case 'status':
      status();
      break;
    case 'reset':
      await reset();
      break;
    case 'grant':
      await grantAppRole();
      break;
    default:
      console.error(`Unknown command "${command}". Use start | stop | status | reset | grant.`);
      process.exit(1);
  }
} catch (error) {
  console.error(`[db] ${error.message}`);
  process.exit(1);
}
