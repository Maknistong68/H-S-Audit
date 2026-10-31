import { test, expect } from '@playwright/test';

test('photo and memo attach to an item and survive reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^B9\.1/ }).click();
  await page.getByLabel('Add photo').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Record memo' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.locator('audio')).toHaveCount(1);
  await page.reload();
  const head = page.getByRole('button', { name: /^B9\.1/ });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click(); // the expanded card is remembered across reloads
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await expect(page.locator('audio')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
});
