import { expect, test } from '@playwright/test';
import { logIn } from './helpers';

test.describe('staff member', () => {
  test.beforeEach(async ({ page }) => logIn(page, 'jonas@eikogkant.example'));

  test('can read setup but not change it', async ({ page }) => {
    await page.goto('/app/setup/business');
    await expect(page.getByLabel('Business name')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await page.goto('/app/setup/services/new');
    await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible();
  });

  test('is kept out of the audit log, analytics and the email outbox — even by direct URL', async ({
    page,
  }) => {
    for (const [path, what] of [
      ['/app/audit', 'the audit log'],
      ['/app/analytics', 'analytics'],
      ['/app/setup/outbox', 'the email outbox'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: `You don’t have access to ${what}` })).toBeVisible();
    }
    await expect(
      page.getByRole('navigation', { name: 'Dashboard' }).first().getByRole('link', { name: 'Audit log' }),
    ).toHaveCount(0);
  });
});
