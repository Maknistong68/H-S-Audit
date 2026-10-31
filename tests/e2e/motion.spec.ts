import { test, expect } from '@playwright/test';

test('sheets close on Escape at once and motion is removed when the phone asks for reduced motion', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByRole('button', { name: 'Start walk' }).click();

  // Escape during the enter animation closes the sheet immediately
  await page.getByRole('button', { name: 'Jump to' }).click();
  await expect(page.getByRole('dialog', { name: 'Jump to section' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Jump to section' })).toBeHidden();

  // the open question unfolds with the 200 ms token...
  await page.getByRole('button', { name: /^A1 / }).click();
  expect(await page.locator('.row-body').evaluate((el) => getComputedStyle(el).animationDuration)).toBe('0.2s');

  // ...and not at all under prefers-reduced-motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /^A2 / }).click();
  expect(await page.locator('.row-body').evaluate((el) => getComputedStyle(el).animationDuration)).toBe('0s');
});
