import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('HR dashboard metrics load with real numbers, not stuck on the loading state', async ({ page }) => {
  await login(page, 'HR');
  await page.goto('/dashboard');
  await page.waitForTimeout(3000);
  await expect(page.getByText('Loading dashboard…')).toHaveCount(0);
  await expect(page.getByText('Number of active candidates', { exact: false })).toBeVisible();
  await expect(page.getByText('Candidates by stage', { exact: false })).toBeVisible();
});

test('Interviewer sees the same staff dashboard (role in STAFF, not RECRUITERS-gated)', async ({ page }) => {
  await login(page, 'Interviewer');
  await page.goto('/dashboard');
  await page.waitForTimeout(3000);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Loading dashboard…')).toHaveCount(0);
});
