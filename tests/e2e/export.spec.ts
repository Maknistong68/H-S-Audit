import { test, expect } from './fixtures';

type Fake = { teammate(who: string, changes: unknown[]): void; putPhoto(path: string, data: ArrayBuffer): void };
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

test('exports an Excel file with the answers, and a backup zip', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-004');
  await page.getByLabel('Audit date').fill('2026-10-28');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^A1 / }).click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await page.getByLabel('Observation note').fill('KPIs not in approved plan');
  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Export Excel' }).click();
  await expect(page.getByText('80 unanswered')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export anyway' }).click()]);
  expect(download.suggestedFilename()).toBe('HSSEW-004-HS-Audit-2026-10-28.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await download.path()) as string);
  const ws = wb.worksheets[0];
  expect(ws.getCell('T9').value).toBe('No');
  expect(ws.getCell('U9').value).toBe('KPIs not in approved plan');
  expect(ws.getCell('Q3').value).toBe('HSSEW-004');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export anyway' }).click()]);
  expect(zip.suggestedFilename()).toBe('HSSEW-004-backup.zip');
  await expect(page.getByText(/Last exported/)).toBeVisible();
});

test('Part 3 is live and evidence photos sit inside their cells', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-005');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Start walk' }).click();
  await page.getByRole('button', { name: /^A1 / }).click();
  await page.getByRole('button', { name: 'Partial', exact: true }).click();
  await page.getByLabel('Observation note').fill('Plan not updated.');
  await page.getByLabel('Add photo').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await page.getByLabel('Add photo').setInputFiles('tests/fixtures/photo.jpg');
  await expect(page.getByRole('img', { name: 'Photo 2' })).toBeVisible();
  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Export Excel' }).click();
  const [download] = await Promise.all([page.waitForEvent('download', (d) => d.suggestedFilename().endsWith('.xlsx')), page.getByRole('button', { name: 'Export anyway' }).click()]);
  const files = unzipSync(new Uint8Array(await readFile((await download.path()) as string)));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  expect(sheet).toMatch(/<c r="R155"[^>]*t="e"[^>]*vm="1"/); // A1's two photos, one in-cell picture
  expect(sheet).toMatch(/<c r="B156"[^>]*><f>B10<\/f>/); // every question row is a live formula
  expect(sheet).toMatch(/<c r="H235"[^>]*><f>IF\(OR\(T109=/);
  const media = Object.keys(files).filter((n) => n.startsWith('xl/media/'));
  expect(media).toEqual(['xl/media/incell1.jpeg']);
  expect(files['xl/media/incell1.jpeg'].length).toBeGreaterThan(5000); // a real composed JPEG, not a stub
});

test("the export fetches a teammate's photo it does not have yet", async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New audit' }).click();
  await page.getByLabel('Audit no').fill('HSSEW-061');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const id = /\/audit\/([^/]+)\//.exec(page.url())![1];
  const jpeg = Array.from(await readFile('tests/fixtures/photo.jpg'));
  await page.evaluate(
    ({ id, at, jpeg }) => {
      const fake = (window as unknown as { __hsFake: Fake }).__hsFake;
      fake.putPhoto(`${id}/55555555-5555-4555-8555-555555555555.jpg`, new Uint8Array(jpeg).buffer);
      fake.teammate('lead', [
        { table: 'hs_answers', key: { audit_id: id, item_id: 'A1' }, fields: { result: 'no', note: 'See photo' }, at },
        {
          table: 'hs_photos',
          key: { id: '55555555-5555-4555-8555-555555555555' },
          fields: { audit_id: id, owner_kind: 'item', owner_id: 'A1', mime: 'image/jpeg', bytes: jpeg.length, width: 640, height: 480, thumb: null, storage_path: `${id}/55555555-5555-4555-8555-555555555555.jpg`, uploaded_at: at, created_at: at },
          at,
        },
      ]);
    },
    { id, at: Date.now() + 1000, jpeg },
  );
  await page.getByRole('button', { name: 'Start walk' }).click();
  await expect(page.locator('#item-A1').getByText('No', { exact: true })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Export Excel' }).click();
  const [download] = await Promise.all([page.waitForEvent('download', (d) => d.suggestedFilename().endsWith('.xlsx')), page.getByRole('button', { name: 'Export anyway' }).click()]);
  const files = unzipSync(new Uint8Array(await readFile((await download.path()) as string)));
  expect(Object.keys(files).filter((n) => n.startsWith('xl/media/'))).toEqual(['xl/media/incell1.jpeg']);
  expect(files['xl/media/incell1.jpeg'].length).toBeGreaterThan(5000);
});

