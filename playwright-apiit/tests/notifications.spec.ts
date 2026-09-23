import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('the notification bell opens a dropdown menu', async ({ page }) => {
  await login(page, 'HR');
  await page.waitForTimeout(1000);
  await page.getByTitle('Notifications').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByText('Notification settings')).toBeVisible();
});

test('the notification dropdown shows either real notifications or the empty state', async ({ page }) => {
  await login(page, 'HR');
  await page.waitForTimeout(1000);
  await page.getByTitle('Notifications').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const empty = menu.getByText("You're all caught up.");
  const hasEmpty = await empty.isVisible().catch(() => false);
  if (!hasEmpty) {
    // At least one real notification item is rendered.
    await expect(menu.locator('button').first()).toBeVisible();
  }
});

test('Escape closes the notification dropdown', async ({ page }) => {
  await login(page, 'HR');
  await page.waitForTimeout(1000);
  await page.getByTitle('Notifications').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});
