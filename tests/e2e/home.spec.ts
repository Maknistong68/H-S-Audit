import { test, expect } from '@playwright/test';

test('create audit, fill header, survives reload, archive and purge gate', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await expect(page).toHaveURL(/\/audit\/[^/]+\/header$/);
  await page.getByLabel('Audit no').fill('HSSEW-004');
  await page.getByLabel('Contractor / WO').fill('4800000882-AL FAHD');
  await expect(page.getByText('All changes saved')).toBeVisible(); // a reload mid-write would abort the IndexedDB transaction
  await page.reload();
  await expect(page.getByLabel('Audit no')).toHaveValue('HSSEW-004');
  await page.goto('./');
  await expect(page.getByText('HSSEW-004')).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click(); // not "Show archived"
  await expect(page.getByText('HSSEW-004')).toBeHidden();
  await page.getByRole('button', { name: 'Show archived' }).click();
  await page.getByRole('button', { name: 'Purge' }).click();
  await page.getByLabel('Type the audit number to confirm').fill('WRONG');
  await expect(page.getByRole('button', { name: 'Purge permanently' })).toBeDisabled();
});
