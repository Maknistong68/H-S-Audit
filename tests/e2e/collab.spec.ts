import { test, expect, type Page } from './fixtures';

/**
 * Teammates are simulated by injecting their changes into the page's fake server (window.__hsFake), which
 * drives the same live channel, merge and screens that a second phone would. Real two-device behaviour is
 * checked against Supabase in the live check.
 */
type Fake = {
  teammate(who: string, changes: unknown[]): void;
  rows(table: string): Array<Record<string, unknown>>;
};
const fake = (page: Page, fn: (f: Fake) => unknown) => page.evaluate(fn as (f: Fake) => unknown, undefined as never);

async function createAudit(page: Page, auditNo: string): Promise<string> {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill(auditNo);
  await expect(page.getByText('All changes saved')).toBeVisible();
  return /\/audit\/([^/]+)\//.exec(page.url())![1];
}

test('two phones on one audit see each other live', async ({ page }) => {
  const id = await createAudit(page, 'HSSEW-010');
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^A1 / }).click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await page.getByLabel('Observation note').fill('Plan outdated');
  await expect(page.getByRole('status').filter({ hasText: 'Up to date' })).toBeVisible({ timeout: 10_000 });
  // the server has this phone's work
  const answers = await page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.rows('hs_answers'));
  expect(answers.find((r) => r.item_id === 'A1')).toMatchObject({ result: 'no', note: 'Plan outdated' });

  // a teammate answers A2 on their phone
  await page.evaluate(
    ({ id, at }) => (window as unknown as { __hsFake: Fake }).__hsFake.teammate('lead', [{ table: 'hs_answers', key: { audit_id: id, item_id: 'A2' }, fields: { result: 'full' }, at }]),
    { id, at: Date.now() + 1000 },
  );
  const a2 = page.locator('#item-A2');
  await expect(a2.getByText('Full', { exact: true })).toBeVisible({ timeout: 5_000 });

  // the audit list says who touched it last (in-app navigation keeps the same fake server)
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByText('Edited by Lee Lead')).toBeVisible();
});

test('a teammate creates an audit and it appears in the list without a reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible();
  await page.evaluate(
    (at) =>
      (window as unknown as { __hsFake: Fake }).__hsFake.teammate('lead', [
        { table: 'hs_audits', key: { id: '11111111-1111-4111-8111-111111111111' }, fields: { audit_no: 'LEAD-1', project_name: 'Pipeline', status: 'draft', template_version: 'book2-2026-10', created_at: at }, at },
      ]),
    Date.now(),
  );
  await expect(page.getByText('LEAD-1')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Edited by Lee Lead')).toBeVisible();
});

test('deleted by a teammate while open', async ({ page }) => {
  const id = await createAudit(page, 'HSSEW-011');
  await page.getByRole('button', { name: 'Start walk' }).click();
  await expect(page.getByRole('button', { name: /^A1 / })).toBeVisible();
  await page.evaluate(
    ({ id, at }) => (window as unknown as { __hsFake: Fake }).__hsFake.teammate('lead', [{ table: 'hs_audits', key: { id }, fields: { deleted_at: at }, at }]),
    { id, at: Date.now() + 1000 },
  );
  await expect(page.getByText('This audit was deleted by Lee Lead')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('link', { name: 'Back to audits' }).click();
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible();
  await expect(page.getByText('HSSEW-011')).toBeHidden();
});

test('deleted by a teammate while Findings is open', async ({ page }) => {
  const id = await createAudit(page, 'HSSEW-012');
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('link', { name: 'Findings' }).click();
  await expect(page.getByRole('heading', { name: /Negative observations/ })).toBeVisible();
  await page.evaluate(
    ({ id, at }) => (window as unknown as { __hsFake: Fake }).__hsFake.teammate('lead', [{ table: 'hs_audits', key: { id }, fields: { deleted_at: at }, at }]),
    { id, at: Date.now() + 1000 },
  );
  await expect(page.getByText('This audit was deleted by Lee Lead')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('link', { name: 'Back to audits' }).click();
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible();
});

