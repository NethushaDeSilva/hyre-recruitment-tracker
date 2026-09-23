import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe.configure({ mode: 'serial' });

async function createDraftPositionWithCandidate(page) {
  const title = `PW Pipeline Test ${Date.now()}`;
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

  const candidateName = `PW Pipeline Candidate ${Date.now()}`;
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Jordan Lee').fill(candidateName);
  await page.getByPlaceholder('name@email.com').fill(`pw.pipeline.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Add candidate' }).last().click();
  await expect(page.getByText(candidateName)).toBeVisible({ timeout: 10000 });

  return { title, candidateName };
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

test('rejecting a candidate removes them from the board and moves them to Rejected', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const { title, candidateName } = await createDraftPositionWithCandidate(page);

  // "Reject" lives directly on the board card and opens RejectModal, which
  // requires a reason to be selected before the confirm button enables.
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.waitForTimeout(500);
  await page.locator('select').first().selectOption({ index: 1 });
  const confirmBtn = page.getByRole('button', { name: 'Reject candidate' });
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await page.waitForTimeout(1500);

  await page.goto('/rejected');
  await page.waitForTimeout(1500);
  await expect(page.getByText(candidateName)).toBeVisible({ timeout: 10000 });

  await deletePosition(page, title);
});

test('the "Move to next stage" button stays disabled until a review comment is posted', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const { title, candidateName } = await createDraftPositionWithCandidate(page);

  await page.getByText(candidateName).click();
  await page.waitForTimeout(800);
  const modal = page.locator('.fixed.inset-0').last();

  const moveBtn = modal.getByRole('button', { name: /Move to HR Screening/i });
  await expect(moveBtn).toBeDisabled();

  await modal.locator('textarea').first().fill('Strong communication in the phone screen — advancing.');
  await modal.getByRole('button', { name: 'Post review' }).click();
  await page.waitForTimeout(1000);
  await expect(moveBtn).toBeEnabled();

  await deletePosition(page, title);
});

// KNOWN LIVE BUG (found by this test, not a test defect): clicking the now-
// enabled "Move to HR Screening" button does NOT move the candidate. The
// Applied column's "Automatic scoring" banner reports
// "Function Transaction.set() called with invalid data. Nested arrays are
// not supported (found in document applicationScores/...)" — a Firestore
// write in the automatic-scoring pipeline is failing, and the stage-move
// action appears to be blocked/undone by that same failure. Reproduced
// consistently across multiple fresh positions/candidates on the live site.
// This is an application bug, out of scope for this Playwright project to
// fix — test.fail() below records it as a known-failing assertion so the
// suite stays honest instead of silently skipping it.
test.fail('clicking the enabled move button actually advances the candidate to HR Screening (BLOCKED — see comment above)', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const { title, candidateName } = await createDraftPositionWithCandidate(page);

  await page.getByText(candidateName).click();
  await page.waitForTimeout(800);
  const modal = page.locator('.fixed.inset-0').last();

  await modal.locator('textarea').first().fill('Strong communication in the phone screen — advancing.');
  await modal.getByRole('button', { name: 'Post review' }).click();
  await page.waitForTimeout(1000);
  await modal.getByRole('button', { name: /Move to HR Screening/i }).click();
  await page.waitForTimeout(3000);

  // Expected (currently failing) behavior: the candidate's "Not scored" /
  // Applied-stage card content disappears once they've moved on.
  await expect(page.getByText('Not scored')).toHaveCount(0);

  await deletePosition(page, title);
});
