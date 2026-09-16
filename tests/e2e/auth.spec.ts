import { expect, test } from '@playwright/test';
import { logIn, unique } from './helpers';

test('sends visitors without a session to login, then back where they were going', async ({ page }) => {
  await page.goto('/app/bookings');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fbookings/);
  await page.getByLabel('Email', { exact: true }).fill('ingrid@eikogkant.example');
  await page.getByLabel('Password', { exact: true }).fill('relay-demo-2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/app\/bookings$/);
});

test('gives the same message for a wrong password as for an unknown account', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('ingrid@eikogkant.example');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();

  await page.getByLabel('Email', { exact: true }).fill(`nobody-${unique()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

test('a new owner signs up, sets up a business, and logs out', async ({ page }) => {
  const id = unique();
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Test Owner');
  await page.getByLabel('Work email').fill(`owner-${id}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.waitForTimeout(1_700); // demo bot check: not faster than a person
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill('a-long-and-unusual-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Business name').fill(`Test Sykkel ${id}`);
  await page.getByLabel('Service name').fill('Tune-up');
  await page.getByRole('button', { name: 'Create business' }).click();
  await expect(page).toHaveURL(/\/app\/today/);
  await expect(page.getByRole('navigation', { name: 'Dashboard' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/app/today');
  await expect(page).toHaveURL(/\/login/);
});

test('each business only sees its own data', async ({ page }) => {
  await logIn(page, 'sofie@tyttebaer.example');
  await page.goto('/app/customers');
  await expect(page.getByRole('main')).not.toContainText('eikogkant');
  await page.goto('/app/setup/services');
  await expect(page.getByRole('main')).not.toContainText('Standard bike service');
});
