import { test, expect } from '@playwright/test';

test('photo attaches to an item and survives reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^B9\.1/ }).click();
  // Adding a photo also drops a copy into the phone's Downloads (gallery on Android)
  const [copy] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Add photo').setInputFiles('tests/fixtures/photo.jpg')]);
  expect(copy.suggestedFilename()).toMatch(/^audit_B9-1_\d{8}-\d{6}\.jpg$/);
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share photo 1' })).toBeVisible();
  await page.reload();
  const head = page.getByRole('button', { name: /^B9\.1/ });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click(); // the expanded card is remembered across reloads
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
});
