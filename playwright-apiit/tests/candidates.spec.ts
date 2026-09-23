import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe.configure({ mode: 'serial' });

async function createDraftPosition(page) {
  const title = `PW Candidates Test ${Date.now()}`;
  await page.goto('/positions');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Open position' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Backend Developer').fill(title);
  await page.getByPlaceholder('Select or type a department').fill('Software Engineering');
  await page.getByPlaceholder('Describe the actual responsibilities, business domain and company-specific work...').fill('Playwright-generated test position — safe to delete.');
  await page.getByPlaceholder('e.g. React, TypeScript, Node.js').fill('TypeScript');
  await page.locator('input[type="date"]').fill('2027-01-01');
  await page.getByRole('button', { name: 'Create & open' }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 30000 });
  return title;
}

async function deletePosition(page, title) {
  await page.goto('/positions');
  await page.waitForTimeout(1000);
  const card = page.locator('div', { hasText: title }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last();
  await card.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(500);
  const confirmBtn = page.getByRole('button', { name: /delete/i }).last();
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
await page.waitForTimeout(9000);
}

test('Add candidate is disabled until name and email are filled', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const title = await createDraftPosition(page);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.waitForTimeout(500);

  await expect(page.getByRole('button', { name: 'Add candidate' }).last()).toBeDisabled();
  await page.getByPlaceholder('e.g. Jordan Lee').fill('PW Test Candidate');
  await expect(page.getByRole('button', { name: 'Add candidate' }).last()).toBeDisabled();

  await deletePosition(page, title);
});

test('an invalid email is rejected with an inline error', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const title = await createDraftPosition(page);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.waitForTimeout(500);

  await page.getByPlaceholder('e.g. Jordan Lee').fill('PW Test Candidate');
  await page.getByPlaceholder('name@email.com').fill('not-an-email');
  await page.getByRole('button', { name: 'Add candidate' }).last().click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();

  await deletePosition(page, title);
});

test('HR can add a candidate and they appear in the Applied stage', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const title = await createDraftPosition(page);
  const candidateName = `PW Candidate ${Date.now()}`;

  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Jordan Lee').fill(candidateName);
  await page.getByPlaceholder('name@email.com').fill(`pw.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Add candidate' }).last().click();

  await expect(page.getByText(candidateName)).toBeVisible({ timeout: 10000 });

  await deletePosition(page, title);
});
