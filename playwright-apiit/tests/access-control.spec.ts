import { test, expect } from '@playwright/test';
import { login } from './helpers';

// RECRUITERS (HR, Management) can access /candidates; Interviewer cannot —
// see App.jsx: `const RECRUITERS = [ROLES.HR, ROLES.MANAGEMENT]` and
// `homeFor(role)` in src/lib/permissions.js, which sends everyone else back
// to /positions.

test('HR can access the Candidates table', async ({ page }) => {
  await login(page, 'HR');
  await page.goto('/candidates');
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/candidates/);
  await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible();
});

test('Interviewer is redirected away from the Candidates table', async ({ page }) => {
  await login(page, 'Interviewer');
  await page.goto('/candidates');
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/positions/);
});

test('Management can access the Candidates table (also a RECRUITERS role)', async ({ page }) => {
  await login(page, 'Management');
  await page.goto('/candidates');
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/candidates/);
});

test('Interviewer is redirected away from /rejected, another RECRUITERS-only route', async ({ page }) => {
  await login(page, 'Interviewer');
  await page.goto('/rejected');
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/positions/);
});
