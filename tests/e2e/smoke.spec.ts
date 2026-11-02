import { test, expect } from './fixtures';

test('app shell loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'HSE Audit' })).toBeVisible();
});
