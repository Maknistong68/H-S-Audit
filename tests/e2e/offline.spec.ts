import { test, expect } from './fixtures';

test('full app loads offline after first visit, including the Excel template', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await context.setOffline(true);
  await page.goto('./settings');
  await expect(page.getByLabel('Dictation language')).toBeVisible();
  // relative to the current page, so it holds for any base path
  const ok = await page.evaluate(async () => (await fetch(new URL('templates/hs-audit-template.xlsx', location.href).toString())).ok);
  expect(ok).toBe(true);
  await context.setOffline(false);
});
