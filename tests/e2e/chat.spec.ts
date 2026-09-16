import { expect, test } from '@playwright/test';
import { logIn, openChat, sendMessage, unique, upcomingWeekdayName } from './helpers';

test('demo scenario 1: a customer books through the chat, and staff can see it', async ({
  page,
  browser,
}) => {
  const email = `kari.${unique()}@example.com`;
  const log = await openChat(page);

  await sendMessage(page, `Can I book a standard service next ${upcomingWeekdayName()} afternoon?`);
  const slot = log.getByRole('button', { name: /at \d{2}:\d{2}$/ }).first();
  await expect(slot).toBeEnabled();
  await slot.click();

  const details = log.getByRole('form', { name: 'Your details for the booking' }).last();
  await details.getByLabel('Name').fill('Kari Nordmann');
  await details.getByLabel('Email', { exact: true }).fill(email);
  await details.getByRole('button', { name: 'Continue' }).click();
  await log.getByRole('button', { name: 'Confirm booking' }).last().click();

  await expect(log.getByText('Booked', { exact: true })).toBeVisible();
  const reference = (await log
    .getByText(/^EK-[2-9A-Z]{5}$/)
    .last()
    .textContent())!;
  await expect(page.getByRole('link', { name: 'Change or cancel this booking' })).toBeVisible();

  // The owner sees the confirmation email in the demo outbox and the assistant's audit entry.
  const staff = await (await browser.newContext()).newPage();
  await logIn(staff, 'ingrid@eikogkant.example');
  await staff.goto('/app/setup/outbox');
  await expect(staff.getByText(email).first()).toBeVisible();
  await staff.goto('/app/audit?actor=ASSISTANT');
  await expect(staff.getByText('booking.created').first()).toBeVisible();
  expect(reference).toMatch(/^EK-/);
});

test('demo scenario 2: an unknown question goes to a person, who replies', async ({ page, browser }) => {
  const name = `Per ${unique()}`;
  const log = await openChat(page);

  await sendMessage(page, 'Do you offer a student discount?');
  await expect(log.getByText(/passed your question to the team/)).toBeVisible();
  const contact = log.getByRole('form', { name: 'Your contact details' }).last();
  await contact.getByLabel('Name').fill(name);
  await contact.getByLabel('Email', { exact: true }).fill(`per.${unique()}@example.com`);
  await contact.getByRole('button', { name: 'Send' }).click();

  const staff = await (await browser.newContext()).newPage();
  await logIn(staff, 'jonas@eikogkant.example');
  await staff.goto('/app/inbox?filter=needs_human');
  await staff
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click();
  await expect(staff.getByText('Needs a person').first()).toBeVisible();
  await staff.getByLabel('Reply to the customer').fill('Yes — 10% off with a valid student card.');
  await staff.getByRole('button', { name: 'Send reply' }).click();

  // The widget polls every few seconds and shows the staff reply.
  await expect(log.getByText('Yes — 10% off with a valid student card.')).toBeVisible({ timeout: 20_000 });
});

test('answers a question from the FAQ and shows where the answer came from', async ({ page }) => {
  const log = await openChat(page);
  await sendMessage(page, 'Where can I park?');
  await expect(log.getByText(/From the FAQ/)).toBeVisible();
});
