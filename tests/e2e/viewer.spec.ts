import { test, expect, signInAs } from './fixtures';

type Fake = { teammate(who: string, changes: unknown[]): void };

test('a viewer can open and export an audit but cannot change it', async ({ page }) => {
  await signInAs(page, 'viewer@test');
  await expect(page.getByText('No audits yet.')).toBeVisible(); // Home is up and listening
  await expect(page.getByRole('button', { name: 'New audit' })).toBeHidden();
  // an auditor's audit arrives from the server while the list is open
  const id = '33333333-3333-4333-8333-333333333333';
  await page.evaluate(
    ({ id, at }) =>
      (window as unknown as { __hsFake: Fake }).__hsFake.teammate('auditor', [
        { table: 'hs_audits', key: { id }, fields: { audit_no: 'HSSEW-050', status: 'draft', template_version: 'book2-2026-10', created_at: at }, at },
        { table: 'hs_answers', key: { audit_id: id, item_id: 'A1' }, fields: { result: 'no', note: 'Missing plan' }, at },
      ]),
    { id, at: Date.now() },
  );
  await page.locator('.list-row-title', { hasText: 'HSSEW-050' }).click();
  await expect(page.getByText('Read-only account')).toBeVisible();
  await page.getByRole('button', { name: /^A1 / }).click();
  await expect(page.getByRole('button', { name: 'Full', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Observation note')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Flag' })).toBeDisabled();
  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Export Excel' }).click();
  const [download] = await Promise.all([page.waitForEvent('download', (d) => d.suggestedFilename().endsWith('.xlsx')), page.getByRole('button', { name: 'Export anyway' }).click()]);
  expect(download.suggestedFilename()).toContain('HSSEW-050');
});
