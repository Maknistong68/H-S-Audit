import { test, expect } from '@playwright/test';

test('app shell loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'HSE Audit' })).toBeVisible();
});
