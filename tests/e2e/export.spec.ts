import { test, expect } from './fixtures';
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

