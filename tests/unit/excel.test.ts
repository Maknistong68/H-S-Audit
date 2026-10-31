import { test, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import fixture from '../fixtures/book2-results.json';
import { buildWorkbook, type ExportInput } from '../../src/export/excel';
import { rowHeightPoints, photoAnchor } from '../../src/export/mapping';
import { scoreAudit } from '../../src/domain/scoring';
import type { Answer, Audit, Positive } from '../../src/db/db';
import type { Result } from '../../src/domain/types';

const tpl = () => readFile('public/templates/hs-audit-template.xlsx');
const jpg = async () => new Uint8Array(await readFile('tests/fixtures/pixel.jpg'));

function input(results: Record<string, Result>, extra: Partial<ExportInput> = {}): ExportInput {
  const audit: Audit = {
    id: 'a',
    header: { contractorWo: 'WO', projectName: 'Proj', auditors: 'J, G', auditDate: '2026-10-28', auditNo: 'HSSEW-004', contactNumber: '055' },
    status: 'draft',
    templateVersion: 'book2-2026-10',
    createdAt: 0,
    updatedAt: 0,
  };
  const answers = new Map<string, Answer>(
    Object.entries(results).map(([k, r]) => [
      k,
      { id: `a:${k}`, auditId: 'a', itemId: k, result: r, note: r === 'no' || r === 'partial' ? `Note for ${k}` : '', flagged: false, repeated: k === 'A1', updatedAt: 0 },
    ]),
  );
  return { audit, answers, positives: [], photos: new Map(), score: scoreAudit(new Map(Object.entries(results))), ...extra };
}

type FormulaCell = { formula: string; result?: unknown };
const formulaOf = (ws: ExcelJS.Worksheet, addr: string) => ws.getCell(addr).value as FormulaCell;

test('fills header, results, notes, part 3 and cached scores', async () => {
  const wb = await buildWorkbook(await tpl(), input(fixture as Record<string, Result>));
  const ws = wb.worksheets[0];
  expect(ws.getCell('D2').value).toBe('WO');
  expect(ws.getCell('D147').value).toBe('WO');
  expect((ws.getCell('Q2').value as Date).toISOString()).toBe('2026-10-28T00:00:00.000Z');
  expect(ws.getCell('T9').value).toBe('No');
  expect(ws.getCell('U9').value).toBe('Repeated observation. Note for A1');
  expect(ws.getCell('T14').value).toBe('N/A');
  expect(ws.getCell('T10').value).toBe('Full');
  expect(ws.getCell('U10').value).toBeNull();
  expect(ws.getCell('B155').value).toBe('A1');
  expect(ws.getCell('H155').value).toBe('Repeated observation. Note for A1');
  expect(ws.getCell('R155').value).toBeNull();
  expect(ws.getCell('R156').value).toBe('COMPLIANT');
  expect(ws.getCell('R160').value).toBe('N/A');
  expect(ws.getCell('H156').value).toBeNull();
  expect(ws.getCell('H152').value).toBe(25);
  expect(ws.getCell('P152').value).toBe(0);
  expect(formulaOf(ws, 'S120').result).toBe(25.5);
  expect(formulaOf(ws, 'R121').result).toBe(69);
  expect(formulaOf(ws, 'T134').result).toBeCloseTo(34 / 36, 6);
  expect(formulaOf(ws, 'R137').result).toBeCloseTo(0.76832, 4);
  expect(formulaOf(ws, 'S120').formula).toContain('SUMPRODUCT');
  expect(ws.model.merges.length).toBe(710);
  expect(wb.calcProperties.fullCalcOnLoad).toBe(true);
});

test('photos and positives', async () => {
  const photos = new Map([
    ['item:A1', [await jpg(), await jpg(), await jpg()]],
    ['positive:p1', [await jpg()]],
  ]);
  const positives: Positive[] = [{ id: 'p1', auditId: 'a', text: 'Clean site', order: 0, updatedAt: 0 }];
  const wb = await buildWorkbook(await tpl(), input(fixture as Record<string, Result>, { photos, positives }));
  const ws = wb.worksheets[0];
  expect(ws.getImages().length).toBe(4);
  expect(ws.getRow(155).height).toBeGreaterThan(ws.getRow(156).height!);
  expect(ws.getCell('C239').value).toBe('Positive');
  expect(ws.getCell('H239').value).toBe('Clean site');
  expect(ws.getCell('P152').value).toBe(1);
  const out = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(out as unknown as Parameters<typeof back.xlsx.load>[0]);
  expect(back.worksheets[0].getImages().length).toBe(4);
});

test('empty audit exports with N/A cached scores', async () => {
  const wb = await buildWorkbook(await tpl(), input({}));
  const ws = wb.worksheets[0];
  expect(ws.getCell('T9').value).toBeNull();
  expect(formulaOf(ws, 'T120').result).toBe('N/A');
  expect(formulaOf(ws, 'R137').result).toBe('N/A');
});

test('row height and photo anchors', () => {
  expect(rowHeightPoints('', 0)).toBe(30);
  expect(rowHeightPoints('x'.repeat(300), 0)).toBeGreaterThanOrEqual(5 * 12 + 6);
  expect(rowHeightPoints('', 3)).toBeGreaterThanOrEqual(2 * 88 * 0.75 + 6);
  expect(rowHeightPoints('x'.repeat(10000), 0)).toBe(409);
  expect(photoAnchor(0, 100)).toEqual({ colOffset: 0, rowOffset: 0 });
  expect(photoAnchor(1, 100).colOffset).toBeGreaterThan(1);
  expect(photoAnchor(1, 100).rowOffset).toBe(0);
  expect(photoAnchor(2, 100).colOffset).toBe(0);
  expect(photoAnchor(2, 100).rowOffset).toBeGreaterThan(0);
});
