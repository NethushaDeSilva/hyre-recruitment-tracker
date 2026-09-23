import { test, expect } from '@playwright/test';
import { login, registerCandidate, createDraftPosition, deletePosition } from './helpers';

// Policy check (confirmed by reading src/pages/JobDetail.jsx and
// src/context/auth-config.js before writing this): Hyre allows a candidate
// to apply to MULTIPLE different open positions at once — there is no
// one-active-application restriction anywhere in the apply flow. The only
// restriction is per-position: you can't re-apply to the SAME position
// after being rejected from it ("You applied for this role and weren't
// selected, so you can't reapply.").
//
// HR (to create/clean up positions) and the candidate (to apply) are
// different accounts, so this uses two separate browser contexts rather
// than logging in and out in the same one — sharing a context would leave
// stale Firebase auth state behind on /login.
test.describe.configure({ mode: 'serial' });

async function applyViaJobsList(page, title) {
  await page.goto('/jobs');
  await page.waitForTimeout(1500);
  await page.getByText(title).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Apply for this role' }).click();
  await page.waitForTimeout(800);
  // ApplyModal carries the phone + CV over from a previous application
  // (see ApplyModal.jsx's `existingCv` / prefilled `form.phone`), so a
  // returning candidate applying to a second position may see no fresh
  // file input at all — just a "Submit application" that's already enabled.
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.count()) {
    await fileInput.first().setInputFiles(require('path').join(__dirname, '..', 'fixtures', 'test-cv.pdf'));
    await page.waitForTimeout(6000);
  }
  const phone = page.getByPlaceholder('+94 7X XXX XXXX');
  if (await phone.isVisible().catch(() => false) && !(await phone.inputValue())) await phone.fill('0771234567');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await page.waitForTimeout(2000);
}

test('a candidate can apply to two different open positions', async ({ browser }) => {
  test.setTimeout(90000);
  const hrPage = await (await browser.newContext()).newPage();
  await login(hrPage, 'HR');
  const titleA = await createDraftPosition(hrPage, 'PW Policy A');
  const titleB = await createDraftPosition(hrPage, 'PW Policy B');

  const candidatePage = await (await browser.newContext()).newPage();
  await registerCandidate(candidatePage, 'PW Policy Candidate');

  await applyViaJobsList(candidatePage, titleA);
  await applyViaJobsList(candidatePage, titleB);

  await candidatePage.goto('/applications');
  await candidatePage.waitForTimeout(1500);
  await expect(candidatePage.getByText(titleA)).toBeVisible();
  await expect(candidatePage.getByText(titleB)).toBeVisible();

  await deletePosition(hrPage, titleA);
  await deletePosition(hrPage, titleB);
});
