import { test, expect } from '@playwright/test';

const HR_EMAIL = 'hr@hyre.app';
const HR_PASSWORD = 'hyre1234';

test('HR logs in successfully and lands on the app', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('you@company.com').fill(HR_EMAIL);
  await page.getByPlaceholder('••••••••').fill(HR_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page).toHaveURL(/\/positions/, { timeout: 15000 });
  // Signed-in shell should no longer show the login form.
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
});
