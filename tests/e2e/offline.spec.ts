import { test, expect } from '@playwright/test';

test('full app loads offline after first visit, including the Excel template', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await context.setOffline(true);
  await page.goto('./settings');
  await expect(page.getByLabel('Dictation language')).toBeVisible();
  const ok = await page.evaluate(async () => (await fetch('/h-s-audit/templates/hs-audit-template.xlsx')).ok);
  expect(ok).toBe(true);
  await context.setOffline(false);
});
