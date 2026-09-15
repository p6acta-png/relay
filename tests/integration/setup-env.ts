import path from 'node:path';

// Runs in each test worker before any test file imports app code.
// Points the app at the dedicated test database — never the dev database.
process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  PASSWORD_HASH_COST: 'test',
  DEMO_MODE: 'false',
});
