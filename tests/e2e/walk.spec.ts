import { test, expect, type Page } from '@playwright/test';

async function newAudit(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-004');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Start walk' }).click();
}

test('answer in sequence, see it in area and search, persist offline', async ({ page, context }) => {
  await newAudit(page);
  await expect(page.getByText('0 / 81 answered')).toBeVisible();
  await page.getByRole('button', { name: /^B9\.1/ }).click();
  await page.getByRole('button', { name: 'Partial' }).click();
  await page.getByLabel('Observation note').fill('Extinguisher at gate 2 overdue');
  await page.getByRole('button', { name: 'Flag' }).click();
  await expect(page.getByText('1 / 81 answered')).toBeVisible();
  await page.getByRole('tab', { name: 'Area' }).click();
  await page.getByRole('button', { name: /Fire/ }).click();
  await expect(page.getByRole('button', { name: /^B9\.1/ })).toContainText('Partial');
  await page.getByRole('tab', { name: 'Search' }).click();
  await page.getByRole('searchbox').fill('gate 2');
  await expect(page.getByRole('button', { name: /^B9\.1/ })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('gate 2');
  await page.getByRole('tab', { name: 'Sequence' }).click();
  await page.getByRole('checkbox', { name: 'Remaining only' }).check();
  await expect(page.getByRole('button', { name: /^B9\.1/ })).toBeHidden();
  await context.setOffline(false);
});

test('next unanswered and tag editing', async ({ page }) => {
  await newAudit(page);
  await page.getByRole('button', { name: /^A1 / }).click();
  await page.getByRole('button', { name: 'Full' }).click();
  await page.getByRole('button', { name: 'Next unanswered' }).click();
  await expect(page.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Tags' }).click();
  await page.getByRole('checkbox', { name: 'Fire' }).check();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Fire', { exact: true })).toBeVisible();
});
