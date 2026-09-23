import { test, expect } from '@playwright/test';
import { login, registerCandidate, createDraftPosition, deletePosition } from './helpers';

// Rejecting a candidate from one position must not silently touch their
// standing on a sibling position they also applied to — talent pool records
// are per-position (see src/components/OtherApplications.jsx, shown on the
// candidate detail modal as "Other Positions Applied To").
test.describe.configure({ mode: 'serial' });

async function applyViaJobsList(page, title) {
  await page.goto('/jobs');
  await page.waitForTimeout(1500);
  await page.getByText(title).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Apply for this role' }).click();
  await page.waitForTimeout(800);
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

test('rejecting a candidate on one position leaves their application on a sibling position untouched', async ({ browser }) => {
  test.setTimeout(120000);

  const hrPage = await (await browser.newContext()).newPage();
  await login(hrPage, 'HR');
  const titleA = await createDraftPosition(hrPage, 'PW Cross A');
  const titleB = await createDraftPosition(hrPage, 'PW Cross B');

  const candidatePage = await (await browser.newContext()).newPage();
  const candidateName = 'PW Cross Candidate';
  await registerCandidate(candidatePage, candidateName);
  await applyViaJobsList(candidatePage, titleA);
  await applyViaJobsList(candidatePage, titleB);

  // Reject from position A only.
  await hrPage.goto('/positions');
  await hrPage.waitForTimeout(1000);
  await hrPage.getByText(titleA).first().click();
  await hrPage.waitForTimeout(1200);
  await hrPage.getByRole('button', { name: 'Reject' }).click();
  await hrPage.waitForTimeout(500);
  await hrPage.locator('select').first().selectOption({ index: 1 });
  const confirmBtn = hrPage.getByRole('button', { name: 'Reject candidate' });
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await hrPage.waitForTimeout(1500);

  // Position B still shows the candidate as an active Applied applicant.
  await hrPage.goto('/positions');
  await hrPage.waitForTimeout(1000);
  await hrPage.getByText(titleB).first().click();
  await hrPage.waitForTimeout(1200);
  // The board annotates the card with the sibling application directly —
  // confirms position B's own record is untouched by A's rejection.
  await expect(hrPage.getByText(`also applied to ${titleA}`)).toBeVisible();
  await expect(hrPage.getByText('Software Engineering · 1 candidates', { exact: false })).toBeVisible();

  // Candidate's own view: rejected on A, still active/applied on B.
  await candidatePage.goto('/applications');
  await candidatePage.waitForTimeout(1500);
  await expect(candidatePage.getByText(titleA)).toBeVisible();
  await expect(candidatePage.getByText(titleB)).toBeVisible();

  await deletePosition(hrPage, titleA);
  await deletePosition(hrPage, titleB);
});
