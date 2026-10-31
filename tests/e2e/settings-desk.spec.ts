import { test, expect } from '@playwright/test';

test('settings: dictation language and custom tag persist', async ({ page }) => {
  await page.goto('./settings');
  await page.getByLabel('Dictation language').selectOption('ar-SA');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await page.getByLabel('Tag name').fill('Welfare');
  await page.getByRole('button', { name: 'Save tag' }).click();
  await expect(page.getByText('Tag "Welfare" added')).toBeVisible(); // the write must land before a reload
  await page.reload();
  await expect(page.getByLabel('Dictation language')).toHaveValue('ar-SA');
  await expect(page.getByText('Welfare')).toBeVisible();
});
