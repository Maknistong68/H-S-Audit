import { test, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { stat } from 'node:fs/promises';

const TEMPLATE = 'public/templates/hs-audit-template.xlsx';

test('template has formulas but no audit data', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.worksheets[0];
  expect(ws.name).toBe('Health & Safety');
  for (const c of ['D2', 'Q2', 'D3', 'D113', 'Q147', 'T9', 'U9', 'T109', 'U109', 'H152', 'P152', 'H155', 'R155', 'B242', 'H242', 'C239']) {
    expect(ws.getCell(c).value, c).toBeNull();
  }
  expect((ws.getCell('S120').value as { formula: string }).formula).toContain('SUMPRODUCT');
  expect((ws.getCell('S24').value as { formula: string }).formula).toContain('SUMIF');
  expect(ws.model.merges).toContain('H239:Q239');
  expect(ws.model.merges.length).toBe(710);
  // ExcelJS keeps conditional formatting on the sheet but does not declare it in its typings
  expect((ws as unknown as { conditionalFormattings: unknown[] }).conditionalFormattings.length).toBe(49);
  expect(ws.getCell('S9').value).toBe(3);
  // Book2 is 13 MB of embedded photos; the template must not be
  expect((await stat(TEMPLATE)).size).toBeLessThan(150_000);
});
