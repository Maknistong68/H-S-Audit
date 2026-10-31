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

test('a note typed before the first answer survives a tap that creates the answer row', async ({ page }) => {
  await newAudit(page);
  await page.getByRole('button', { name: /^A2 / }).click();
  await page.getByRole('button', { name: 'Add note' }).click();
  const note = page.getByLabel('Observation note');
  // Type and tap Flag inside one page call so both land well inside the 300 ms note debounce:
  // Flag creates the answer row while the note write is still pending.
  await page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'abc');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Flag')!.click();
  });
  await note.pressSequentially('d');
  await page.waitForTimeout(800);
  await page.reload();
  const head = page.getByRole('button', { name: /^A2 / });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(page.getByLabel('Observation note')).toHaveValue('abcd');
});

test('field controls meet the 48 px tap target', async ({ page }) => {
  await newAudit(page);
  await page.getByRole('button', { name: /^A1 / }).click();
  const targets = [
    page.getByRole('button', { name: 'Flag' }),
    page.getByRole('button', { name: 'Next unanswered' }),
    page.getByRole('tab', { name: 'Area' }),
    page.locator('label', { hasText: 'Remaining only' }),
  ];
  for (const t of targets) expect((await t.boundingBox())!.height, await t.innerText()).toBeGreaterThanOrEqual(48);
  await page.getByRole('tab', { name: 'Area' }).click();
  expect((await page.getByRole('button', { name: /Fire/ }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
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
