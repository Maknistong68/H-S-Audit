import { test, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import fixture from '../fixtures/book2-results.json';
import { unzipSync, strFromU8 } from 'fflate';
import { buildWorkbook, buildXlsx, type ExportInput } from '../../src/export/excel';
import { rowHeightPoints } from '../../src/export/mapping';
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
  // Part 3 is live, exactly like Book2: every question row is formulas pointing at Part 1
  expect(formulaOf(ws, 'B155')).toEqual({ formula: 'B9', result: 'A1' });
  expect(formulaOf(ws, 'C155').formula).toBe('C9');
  expect(formulaOf(ws, 'C155').result).toMatch(/^Is there a strategic plan/);
  expect(formulaOf(ws, 'H155')).toEqual({ formula: 'IF(OR(T9="No",T9="Partial"),IF(U9="","",U9),"")', result: 'Repeated observation. Note for A1' });
  expect(formulaOf(ws, 'R155').formula).toBe('IF(T9="Full","COMPLIANT",IF(T9="N/A","N/A",""))');
  expect(formulaOf(ws, 'R155').result ?? '').toBe(''); // ExcelJS stores an empty cached value as none
  expect(formulaOf(ws, 'R156').result).toBe('COMPLIANT');
  expect(formulaOf(ws, 'R160').result).toBe('N/A');
  expect(formulaOf(ws, 'H156').result ?? '').toBe('');
  expect(formulaOf(ws, 'B235')).toEqual({ formula: 'B109', result: 'C2.19' });
  expect(formulaOf(ws, 'H235').formula).toBe('IF(OR(T109="No",T109="Partial"),IF(U109="","",U109),"")');
  // counts are live too
  expect(formulaOf(ws, 'H152')).toEqual({ formula: 'COUNTIF(T9:T109,"No")+COUNTIF(T9:T109,"Partial")', result: 25 });
  expect(formulaOf(ws, 'P152').formula).toBe('COUNTIF(C239:C322,"Positive")');
  expect(formulaOf(ws, 'P152').result ?? 0).toBe(0); // falsy cached values are stored as none
  expect(formulaOf(ws, 'S120').result).toBe(25.5);
  expect(formulaOf(ws, 'R121').result).toBe(69);
  expect(formulaOf(ws, 'T134').result).toBeCloseTo(34 / 36, 6);
  expect(formulaOf(ws, 'R137').result).toBeCloseTo(0.76832, 4);
  expect(formulaOf(ws, 'S120').formula).toContain('SUMPRODUCT');
  expect(ws.model.merges.length).toBe(710);
  expect(wb.calcProperties.fullCalcOnLoad).toBe(true);
});

test('photos sit inside the Evidence (Photo) cell of their own row, as Excel in-cell pictures', async () => {
  const photos = new Map([
    ['item:A1', [await jpg(), await jpg(), await jpg()]],
    ['item:B9.1', [await jpg()]],
    ['positive:p1', [await jpg()]],
  ]);
  const positives: Positive[] = [{ id: 'p1', auditId: 'a', text: 'Clean site', order: 0, updatedAt: 0 }];
  const composed: number[] = [];
  const bytes = await buildXlsx(await tpl(), input(fixture as Record<string, Result>, { photos, positives }), {
    compose: async (imgs) => {
      composed.push(imgs.length);
      return imgs[0];
    },
  });
  expect(composed.sort()).toEqual([1, 1, 3]); // several photos of one question become one picture
  const files = unzipSync(bytes);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  const cell = (ref: string) => sheet.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>.*?</c>)`))?.[0] ?? '';
  expect(cell('R155')).toMatch(/t="e"/); // A1
  expect(cell('R155')).toMatch(/vm="\d+"/);
  expect(cell('R196')).toMatch(/vm="\d+"/); // B9.1 is the 42nd question: row 155 + 41
  expect(cell('R239')).toMatch(/vm="\d+"/); // the positive observation
  expect(cell('R156')).not.toMatch(/vm=/); // no photo: keeps its formula
  expect(Object.keys(files).filter((n) => n.startsWith('xl/media/')).length).toBe(3);
  for (const part of ['xl/metadata.xml', 'xl/richData/rdrichvalue.xml', 'xl/richData/rdrichvaluestructure.xml', 'xl/richData/rdRichValueTypes.xml', 'xl/richData/richValueRel.xml', 'xl/richData/_rels/richValueRel.xml.rels']) {
    expect(files[part], part).toBeDefined();
  }
  expect(strFromU8(files['xl/richData/rdrichvalue.xml'])).toContain('count="3"');
  const types = strFromU8(files['[Content_Types].xml']);
  expect(types).toContain('/xl/metadata.xml');
  expect(types).toContain('Extension="jpeg"');
  expect(strFromU8(files['xl/_rels/workbook.xml.rels'])).toContain('richData/rdrichvalue.xml');
  // no floating pictures any more, and the workbook still opens
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(bytes as unknown as Parameters<typeof back.xlsx.load>[0]);
  expect(back.worksheets[0].getImages().length).toBe(0);
  expect(back.worksheets[0].getCell('C239').value).toBe('Positive');
  expect(back.worksheets[0].getRow(155).height).toBeGreaterThanOrEqual(110);
});

test('empty audit exports with N/A cached scores', async () => {
  const wb = await buildWorkbook(await tpl(), input({}));
  const ws = wb.worksheets[0];
  expect(ws.getCell('T9').value).toBeNull();
  expect(formulaOf(ws, 'T120').result).toBe('N/A');
  expect(formulaOf(ws, 'R137').result).toBe('N/A');
});

test('row height fits the note and leaves room for an in-cell photo', () => {
  expect(rowHeightPoints('', 0)).toBe(30);
  expect(rowHeightPoints('x'.repeat(300), 0)).toBeGreaterThanOrEqual(5 * 12 + 6);
  expect(rowHeightPoints('', 1)).toBe(110);
  expect(rowHeightPoints('x'.repeat(10000), 0)).toBe(409);
});
