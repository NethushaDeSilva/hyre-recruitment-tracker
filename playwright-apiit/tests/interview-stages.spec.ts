import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Stage editing is only allowed before recruitment has started (see
// StageConfigModal.jsx: "Recruitment has started — the stages are locked").
// The seeded CE-02/FD-05 positions already have hired candidates, so a
// fresh throwaway position is created here to exercise real editing.
test.describe.configure({ mode: 'serial' });

async function createDraftPosition(page) {
  const title = `PW Stage Test ${Date.now()}`;
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

test('the default stage list is shown for a new position', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const title = await createDraftPosition(page);
  await page.getByRole('button', { name: 'Configure stages' }).click();
  await page.waitForTimeout(800);

  await expect(page.getByText('HR Screening', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Department Review', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Initial Interview', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Final Interview', { exact: false }).first()).toBeVisible();

  await deletePosition(page, title);
});

test('editing a stage name persists after Save now (before recruitment starts)', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const title = await createDraftPosition(page);
  await page.getByRole('button', { name: 'Configure stages' }).click();
  await page.waitForTimeout(800);

  const stageInput = page.locator('input[value="Initial Interview"]');
  const renamed = 'Initial Interview (PW)';
  await stageInput.fill(renamed);
  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(1200);

  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Configure stages' }).click();
  await page.waitForTimeout(800);
  await expect(page.locator(`input[value="${renamed}"]`)).toBeVisible();

  await deletePosition(page, title);
});
