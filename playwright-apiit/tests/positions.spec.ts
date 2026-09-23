import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page, 'HR');
  await page.goto('/positions');
  await page.waitForTimeout(1000);
});

test('required-field validation blocks an empty position from being created', async ({ page }) => {
  test.setTimeout(60000);
  await page.getByRole('button', { name: 'Open position' }).click();
  await page.waitForTimeout(500);
  // Submit is disabled until the required fields are filled — that IS the validation.
  await expect(page.getByRole('button', { name: 'Create & open' })).toBeDisabled();
});

test('HR can create a new position with the required fields filled', async ({ page }) => {
  test.setTimeout(60000);
  const title = `PW Test Position ${Date.now()}`;
  await page.getByRole('button', { name: 'Open position' }).click();
  await page.waitForTimeout(500);

  await page.getByPlaceholder('e.g. Backend Developer').fill(title);
  await page.getByPlaceholder('Select or type a department').fill('Software Engineering');
  await page.getByPlaceholder('Describe the actual responsibilities, business domain and company-specific work...').fill('Playwright-generated test position — safe to delete.');
  await page.getByPlaceholder('e.g. React, TypeScript, Node.js').fill('TypeScript, Playwright');
  await page.locator('input[type="date"]').fill('2027-01-01');

  await page.getByRole('button', { name: 'Create & open' }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 30000 });

  // Cleanup: delete the position we created so repeated runs don't accumulate.
  await page.goto('/positions');
  await page.waitForTimeout(1000);
  const card = page.locator('div', { hasText: title }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last();
  await card.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(500);
  const confirmBtn = page.getByRole('button', { name: /delete/i }).last();
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
await page.waitForTimeout(9000);
});
