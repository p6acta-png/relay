import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'relay-demo-2026';
export const BUSINESS_PATH = '/w/eik-og-kant';

export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export async function logIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/app\//);
}

/**
 * Opens the chat on the demo business page. The demo bot check rejects a first message sent
 * less than 1.5 seconds after the page was rendered, as a person could not type that fast.
 */
export async function openChat(page: Page) {
  await page.goto(BUSINESS_PATH);
  await page.waitForTimeout(1_700);
  await page.getByRole('button', { name: 'Ask a question' }).click();
  const log = page.getByRole('log');
  await expect(log).toBeVisible();
  return log;
}

export async function sendMessage(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
}

/** The next weekday at least two days ahead, as the name the chat understands ("Tuesday"). */
export function upcomingWeekdayName() {
  const date = new Date(Date.now() + 2 * 24 * 3_600_000);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return date.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/Oslo' });
}
