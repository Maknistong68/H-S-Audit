import { test, expect, type Page } from './fixtures';

type Fake = { setOnline(v: boolean): void; rows(table: string): Array<Record<string, unknown>> };
const setOnline = (page: Page, online: boolean) =>
  page.evaluate((v: boolean) => {
    (window as unknown as { __hsFake: Fake }).__hsFake.setOnline(v);
    window.dispatchEvent(new Event(v ? 'online' : 'offline'));
  }, online);

test('edits made offline reach the server when back online', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-020');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.rows('hs_audits').map((a) => a.audit_no)), { timeout: 10_000 })
    .toContain('HSSEW-020');
  await expect(page.getByRole('status').filter({ hasText: 'Up to date' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Start walk' }).click();
  await setOnline(page, false);
  for (const item of ['A1', 'A2', 'A3']) {
    await page.getByRole('button', { name: new RegExp(`^${item} `) }).click();
    await page.getByRole('button', { name: 'Full', exact: true }).click();
  }
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click(); // in-app navigation: a reload would start a fresh fake server
  await expect(page.getByText('3 changes waiting')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.rows('hs_answers').length)).toBe(0);
  await setOnline(page, true);
  await expect(page.getByRole('status').filter({ hasText: 'Up to date' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('3 changes waiting')).toBeHidden();
  const rows = await page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.rows('hs_answers'));
  expect(rows.map((r) => r.item_id).sort()).toEqual(['A1', 'A2', 'A3']);
  expect(rows.every((r) => r.result === 'full')).toBe(true);
});

test('audits already on the phone can be uploaded', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible();
  // an audit left over from before accounts existed, as the database upgrade marks it
  await page.evaluate(async () => {
    const req = indexedDB.open('hs-audit');
    const db = await new Promise<IDBDatabase>((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(['audits', 'answers'], 'readwrite');
      tx.objectStore('audits').put({ id: '22222222-2222-4222-8222-222222222222', templateVersion: 'book2-2026-10', status: 'draft', header: { contractorWo: 'WO', projectName: 'P', auditors: 'J', auditDate: '2026-10-20', auditNo: 'PHONE-1', contactNumber: '' }, createdAt: 1, updatedAt: 2, localOnly: true });
      tx.objectStore('answers').put({ id: '22222222-2222-4222-8222-222222222222:A1', auditId: '22222222-2222-4222-8222-222222222222', itemId: 'A1', result: 'no', note: 'old note', flagged: false, repeated: false, updatedAt: 2 });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByText('1 audit on this phone is not in the team yet')).toBeVisible();
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText('not in the team yet')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.rows('hs_audits').map((a) => a.audit_no)), { timeout: 10_000 })
    .toContain('PHONE-1');
  await expect(page.getByRole('status').filter({ hasText: 'Up to date' })).toBeVisible({ timeout: 10_000 });
  const answers = await page.evaluate(() => (window as unknown as { __hsFake: Fake }).__hsFake.rows('hs_answers'));
  expect(answers.find((a) => a.note === 'old note')).toBeTruthy();
});
