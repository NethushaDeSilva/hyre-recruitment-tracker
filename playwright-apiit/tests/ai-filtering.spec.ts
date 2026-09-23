import { test, expect } from '@playwright/test';
import { login, createDraftPosition, deletePosition } from './helpers';

test.describe.configure({ mode: 'serial' });

test('a new position shows the automatic-scoring status and a shortlist threshold control', async ({ page }) => {
  await login(page, 'HR');
  const title = await createDraftPosition(page, 'PW AI Filter Test');
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Jordan Lee').fill('PW Filter Candidate');
  await page.getByPlaceholder('name@email.com').fill(`pw.filter.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Add candidate' }).last().click();
  await page.waitForTimeout(2000);

  await expect(page.getByText('Shortlist threshold')).toBeVisible();
  await expect(page.locator('input[type="range"]')).toBeVisible();
  await expect(page.getByText(/scoring/i).first()).toBeVisible();

  await deletePosition(page, title);
});

// KNOWN LIVE BUG (also surfaced independently by pipeline-stages.spec.ts):
// automatic CV-vs-requirements scoring is failing on the live site for every
// newly added candidate. The Applied column shows:
//   "Automatic scoring could not finish: Saved 0/1; 0 failed, 1 outstanding.
//    Function Transaction.set() called with invalid data. Nested arrays are
//    not supported (found in document applicationScores/...)"
// i.e. a Firestore write in the scoring pipeline (functions/api/rescore-
// vacancy.js or functions/_lib/filtration-ai.js) is passing a nested array
// into a document field, which Firestore rejects outright. This means no
// candidate can currently receive an AI match score on the live site — the
// core "Filter with AI" feature is non-functional in production right now.
// This is an application bug, out of scope for this Playwright project to
// fix. test.fail() records it as a known-failing assertion.
test.fail('a newly added candidate receives an automatic AI match score (BLOCKED — see comment above)', async ({ page }) => {
  await login(page, 'HR');
  const title = await createDraftPosition(page, 'PW AI Score Test');
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Jordan Lee').fill('PW Score Candidate');
  await page.getByPlaceholder('name@email.com').fill(`pw.filterscore.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Add candidate' }).last().click();
  await page.waitForTimeout(5000);

  await expect(page.getByText('Automatic scoring could not finish', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Not scored')).toHaveCount(0);

  await deletePosition(page, title);
});
