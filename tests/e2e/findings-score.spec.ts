import { test, expect } from '@playwright/test';

test('findings list and score reflect answers', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByRole('button', { name: 'Start walk' }).click();
  for (const [id, r] of [['A1', 'No'], ['A2', 'Full'], ['A3', 'Partial']] as const) {
    await page.getByRole('button', { name: new RegExp(`^${id} `) }).click();
    await page.getByRole('button', { name: r, exact: true }).click();
  }
  await page.getByRole('link', { name: 'Findings' }).click();
  await expect(page.getByText('Negative observations: 2')).toBeVisible();
  await expect(page.getByText('Missing note')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add positive observation' }).click();
  await page.getByLabel('Positive observation').fill('Housekeeping excellent');
  await expect(page.getByText('Positive observations: 1')).toBeVisible();
  await page.getByRole('link', { name: 'Score' }).click();
  await expect(page.getByText('50%').first()).toBeVisible(); // A: (0 + 3 + 1.5) / 9, and overall (only A defined)
  await expect(page.getByText('Non-Compliant')).toBeVisible();
  await expect(page.getByText('78 unanswered')).toBeVisible();
});
