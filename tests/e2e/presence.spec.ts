import { test, expect, type Page } from './fixtures';

type Fake = {
  teammate(who: string, changes: unknown[]): void;
  presence(who: string, topic: string, itemId: string | null): void;
};

async function openWalk(page: Page, auditNo: string): Promise<string> {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill(auditNo);
  await expect(page.getByText('All changes saved')).toBeVisible();
  const id = /\/audit\/([^/]+)\//.exec(page.url())![1];
  await page.getByRole('button', { name: 'Start walk' }).click();
  await expect(page.getByRole('button', { name: /^A1 / })).toBeVisible();
  return id;
}

test('shows who else is in the audit and which question they are on', async ({ page }) => {
  const id = await openWalk(page, 'HSSEW-040');
  await page.evaluate((id) => (window as unknown as { __hsFake: Fake }).__hsFake.presence('lead', `audit:${id}`, 'B1.1'), id);
  const chips = page.getByLabel('Also in this audit: Lee Lead');
  await expect(chips).toBeVisible({ timeout: 5_000 });
  await expect(chips.getByText('LL')).toBeVisible();
  await expect(page.locator('#item-B1\\.1').getByText('Lee Lead is here')).toBeVisible();
  await page.evaluate((id) => (window as unknown as { __hsFake: Fake }).__hsFake.presence('lead', `audit:${id}`, null), id);
  await expect(page.locator('#item-B1\\.1').getByText('Lee Lead is here')).toBeHidden();
});

test('the open card names who last edited the question', async ({ page }) => {
  const id = await openWalk(page, 'HSSEW-041');
  await page.evaluate(
    ({ id, at }) => (window as unknown as { __hsFake: Fake }).__hsFake.teammate('lead', [{ table: 'hs_answers', key: { audit_id: id, item_id: 'A3' }, fields: { result: 'partial', note: 'Half done' }, at }]),
    { id, at: Date.now() + 1000 },
  );
  await expect(page.locator('#item-A3').getByText('Partial', { exact: true })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /^A3 / }).click();
  await expect(page.getByText('Edited by Lee Lead')).toBeVisible();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.getByText('Edited by you')).toBeVisible();
});
