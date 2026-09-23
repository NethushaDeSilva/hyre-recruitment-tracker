import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Score entry (a 0-100 number input with a comment) only appears once a
// candidate is at a stage AFTER "Applied" — see CandidateDetailModal.jsx's
// `scoreRequired = !isTerminal && !isApplied`. Reaching HR Screening (the
// first scored stage) requires the "Move to next stage" action to actually
// work, which pipeline-stages.spec.ts found is currently broken on the live
// site (automatic scoring throws a Firestore "nested arrays" write error
// that blocks the move). So the live 0-100 validation UI is unreachable
// through the normal candidate flow right now — skipped rather than faked.
test.skip('invalid numeric scores (e.g. > 100 or negative) are rejected by the review form', async () => {
  // Blocked: requires the candidate to be at a scored stage (HR Screening or
  // later), which the app currently cannot reach — see pipeline-stages.spec.ts.
});

test('a review comment is required before a score-gated move is possible', async ({ page }) => {
  test.setTimeout(60000);
  await login(page, 'HR');
  const title = `PW Scoring Test ${Date.now()}`;
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

  const candidateName = `PW Scoring Candidate ${Date.now()}`;
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Jordan Lee').fill(candidateName);
  await page.getByPlaceholder('name@email.com').fill(`pw.scoring.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Add candidate' }).last().click();
  await expect(page.getByText(candidateName)).toBeVisible({ timeout: 10000 });

  await page.getByText(candidateName).click();
  await page.waitForTimeout(800);
  const modal = page.locator('.fixed.inset-0').last();
  const postBtn = modal.getByRole('button', { name: 'Post review' });
  await expect(postBtn).toBeDisabled();
  await modal.locator('textarea').first().fill('Solid first impression.');
  await expect(postBtn).toBeEnabled();

  await page.goto('/positions');
  await page.waitForTimeout(1000);
  const card = page.locator('div', { hasText: title }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last();
  await card.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(500);
  const confirmBtn = page.getByRole('button', { name: /delete/i }).last();
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
await page.waitForTimeout(9000);
});
