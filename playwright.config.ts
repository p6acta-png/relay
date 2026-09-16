import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '3100';

/**
 * Browser tests run against a production build on port 3100 with its own seeded database
 * (see scripts/e2e-server.mjs), so they never interfere with `npm run dev` or your demo data.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // The flows share one seeded database and one set of rate limits; run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://localhost:${PORT}/login`,
    // Building and seeding take a while on the first run.
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
});
