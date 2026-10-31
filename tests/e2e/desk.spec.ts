import { test, expect, devices } from '@playwright/test';

// A desktop browser (the cloud PC): Playwright requires the device override at file level.
test.use({ ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } });

test('two panes and keyboard shortcuts', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^A1 / }).click();
  await expect(page.getByTestId('walk-detail')).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: 'Partial' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('j');
  await expect(page.getByTestId('walk-detail')).toContainText('A2');
  await page.keyboard.press('f');
  await expect(page.getByRole('button', { name: 'Flag' })).toHaveAttribute('aria-pressed', 'true');
});
