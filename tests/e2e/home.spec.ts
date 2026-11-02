import { test, expect, signInAs } from './fixtures';

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
  await page.getByRole('button', { name: 'Archived' }).click();
  await expect(page.getByText('HSSEW-004')).toBeVisible();
  await page.getByRole('button', { name: 'Delete for the team' }).click();
  await page.getByLabel('Type the audit number to confirm').fill('WRONG');
  await expect(page.getByRole('button', { name: 'Delete for the team', exact: true })).toBeDisabled();
  await page.getByLabel('Type the audit number to confirm').fill('HSSEW-004');
  await page.getByRole('button', { name: 'Delete for the team', exact: true }).click();
  await expect(page.locator('.list-row-title', { hasText: 'HSSEW-004' })).toBeHidden();
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.list-row-title', { hasText: 'HSSEW-004' })).toBeHidden();
});

test('admins see deleted audits and can restore them; search finds by project', async ({ page }) => {
  await signInAs(page, 'admin@test');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-030');
  await page.getByLabel('Project name').fill('Pipeline camp');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.goto('./');
  await page.getByLabel('Search audits').fill('pipeline');
  await expect(page.getByText('HSSEW-030')).toBeVisible();
  await page.getByLabel('Search audits').fill('nothing-here');
  await expect(page.getByText('HSSEW-030')).toBeHidden();
  await page.getByLabel('Search audits').fill('');
  await page.getByRole('button', { name: 'Delete for the team' }).click();
  await page.getByLabel('Type the audit number to confirm').fill('HSSEW-030');
  await page.getByRole('button', { name: 'Delete for the team', exact: true }).click();
  await expect(page.locator('.list-row-title', { hasText: 'HSSEW-030' })).toBeHidden();
  await page.getByRole('button', { name: 'Deleted' }).click();
  await expect(page.locator('.list-row-title', { hasText: 'HSSEW-030' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.list-row-title', { hasText: 'HSSEW-030' })).toBeVisible();
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

test('the header offers the contractor list and fills the WO field', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await expect(page.getByLabel('Audit no')).toBeVisible();
  await page.getByLabel('Contractor', { exact: true }).selectOption('4800001322');
  await expect(page.getByLabel('Contractor / WO')).toHaveValue('4800001322-AL FAHD CONTRACTING');
  await expect(page.getByText('All changes saved')).toBeVisible();
});

