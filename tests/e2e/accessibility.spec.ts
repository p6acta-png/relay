import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { logIn, openChat } from './helpers';

/**
 * Automated WCAG 2.1 A/AA checks with axe. They catch a useful subset of problems (labels,
 * contrast, names, landmarks); they do not replace testing with a keyboard and a screen reader.
 */
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}

test('public pages', async ({ page }) => {
  for (const path of [
    '/',
    '/login',
    '/signup',
    '/learn',
    '/learn/architecture',
    '/learn/subsystems/tenancy',
  ]) {
    await page.goto(path);
    await expectNoViolations(page);
  }
});

test('business page with the chat open', async ({ page }) => {
  const log = await openChat(page);
  await expect(log).toBeVisible();
  await expectNoViolations(page);
});

test('dashboard pages', async ({ page }) => {
  await logIn(page, 'ingrid@eikogkant.example');
  for (const path of [
    '/app/today',
    '/app/inbox',
    '/app/bookings',
    '/app/bookings/new',
    '/app/automations/new',
    '/app/analytics',
    '/app/audit',
    '/app/setup/business',
    '/app/setup/staff',
  ]) {
    await page.goto(path);
    await expectNoViolations(page);
  }
});
