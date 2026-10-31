import { test, expect } from '@playwright/test';

test('settings: dictation language and custom tag persist', async ({ page }) => {
  await page.goto('./settings');
  await page.getByLabel('Dictation language').selectOption('ar-SA');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await page.getByLabel('Tag name').fill('Welfare');
  await page.getByRole('button', { name: 'Save tag' }).click();
  await expect(page.getByText('Tag "Welfare" added')).toBeVisible(); // the write must land before a reload
  await page.getByRole('checkbox', { name: 'Keep a copy of each photo in Downloads' }).uncheck();
  // wait until the setting is really in IndexedDB; a reload mid-write would abort the transaction
  await page.waitForFunction(async () => {
    const req = indexedDB.open('hs-audit');
    const db = await new Promise<IDBDatabase>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const row = await new Promise<{ value?: unknown } | undefined>((res) => { const r = db.transaction('settings').objectStore('settings').get('photoCopies'); r.onsuccess = () => res(r.result); });
    db.close();
    return row?.value === false;
  });
  await page.reload();
  await expect(page.getByLabel('Dictation language')).toHaveValue('ar-SA');
  await expect(page.getByText('Welfare')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Keep a copy of each photo in Downloads' })).not.toBeChecked();
});
