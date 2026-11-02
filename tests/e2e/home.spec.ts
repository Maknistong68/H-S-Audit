import { test, expect } from './fixtures';

test('create audit, fill header, survives reload, archive and purge gate', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await expect(page).toHaveURL(/\/audit\/[^/]+\/header$/);
  await page.getByLabel('Audit no').fill('HSSEW-004');
  await page.getByLabel('Contractor / WO').fill('4800000882-AL FAHD');
  await expect(page.getByText('All changes saved')).toBeVisible(); // a reload mid-write would abort the IndexedDB transaction
  await page.reload();
  await expect(page.getByLabel('Audit no')).toHaveValue('HSSEW-004');
  await page.goto('./');
  await expect(page.getByText('HSSEW-004')).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click(); // not "Show archived"
  await expect(page.getByText('HSSEW-004')).toBeHidden();
  await page.getByRole('button', { name: 'Show archived' }).click();
  await page.getByRole('button', { name: 'Purge' }).click();
  await page.getByLabel('Type the audit number to confirm').fill('WRONG');
  await expect(page.getByRole('button', { name: 'Purge permanently' })).toBeDisabled();
});

test('a damaged audit row does not lock the auditor out', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.goto('./');
  await page.evaluate(async () => {
    const req = indexedDB.open('hs-audit');
    const db = await new Promise<IDBDatabase>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('audits', 'readwrite');
      tx.objectStore('audits').put({ id: 'bad-row', templateVersion: 'x', status: 'draft', createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByText('Untitled audit').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'New audit' })).toBeVisible();
});
