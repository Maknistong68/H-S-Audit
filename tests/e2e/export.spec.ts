import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';

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
