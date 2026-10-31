import ExcelJS from 'exceljs';
import { allItems, checklist } from '../data/checklist';
import type { Answer, Audit, AuditHeader, Positive } from '../db/db';
import { ownerKey } from '../db/ids';
import { repo } from '../db/repo';
import { excelFilename } from '../domain/filename';
import { scoreAudit, type AuditScore } from '../domain/scoring';
import type { Checklist, Result } from '../domain/types';
import {
  COUNT_CELLS,
  HEADER_CELLS,
  NOTE_COL,
  OVERALL_CELL,
  PART1_SCORE_CELL,
  PART2_ROW,
  PART3,
  PHOTO,
  REPEATED_PREFIX,
  RESULT_COL,
  RESULT_LABEL,
  part1RowHeightPoints,
  photoAnchor,
  rowHeightPoints,
} from './mapping';

export interface ExportInput {
  audit: Audit;
  answers: Map<string, Answer>;
  positives: Positive[];
  /** ownerKey → JPEG bytes, in display order. */
  photos: Map<string, Uint8Array[]>;
  score: AuditScore;
  checklist?: Checklist;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function headerValue(key: keyof AuditHeader, value: string): ExcelJS.CellValue {
  if (!value) return null;
  if (key === 'auditDate' && ISO_DATE.test(value)) return new Date(`${value}T00:00:00Z`);
  return value;
}

function setFormulaResult(ws: ExcelJS.Worksheet, addr: string, result: number | string): void {
  const cell = ws.getCell(addr);
  const v = cell.value;
  if (v && typeof v === 'object' && 'formula' in v) {
    cell.value = { ...(v as ExcelJS.CellFormulaValue), result } as ExcelJS.CellValue;
  }
}

const ratioOrNa = (ratio: number | null): number | string => (ratio === null ? 'N/A' : ratio);

function noteText(answer: Answer | undefined): string {
  if (!answer) return '';
  const note = answer.note.trim();
  if (!note) return '';
  return answer.repeated ? REPEATED_PREFIX + note : note;
}

function placePhotos(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, row: number, photos: Uint8Array[], rowHeightPt: number): void {
  photos.slice(0, PHOTO.maxPerItem).forEach((bytes, index) => {
    const imageId = wb.addImage({ buffer: bytes as unknown as ExcelJS.Buffer, extension: 'jpeg' });
    const { colOffset, rowOffset } = photoAnchor(index, rowHeightPt);
    ws.addImage(imageId, {
      tl: { col: PART3.evidenceColIndex0 + colOffset, row: row - 1 + rowOffset },
      ext: { width: PHOTO.widthPx, height: PHOTO.heightPx },
    });
  });
}

export async function buildWorkbook(template: ArrayBuffer | Uint8Array, input: ExportInput): Promise<ExcelJS.Workbook> {
  const c = input.checklist ?? checklist;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];

  // Header, repeated on all three parts
  for (const key of Object.keys(HEADER_CELLS) as (keyof AuditHeader)[]) {
    const value = headerValue(key, input.audit.header[key] ?? '');
    for (const addr of HEADER_CELLS[key]) ws.getCell(addr).value = value;
  }

  // Part 1 results and notes; Part 3 findings
  for (const item of allItems(c)) {
    const answer = input.answers.get(item.id);
    const result = answer?.result;
    const note = noteText(answer);
    ws.getCell(`${RESULT_COL}${item.row}`).value = result ? RESULT_LABEL[result] : null;
    ws.getCell(`${NOTE_COL}${item.row}`).value = note || null;
    ws.getRow(item.row).height = part1RowHeightPoints(item.text, note);

    const r = item.part3Row;
    const negative = result === 'no' || result === 'partial';
    ws.getCell(`${PART3.idCol}${r}`).value = item.id;
    ws.getCell(`${PART3.questionCol}${r}`).value = item.text;
    ws.getCell(`${PART3.noteCol}${r}`).value = negative && note ? note : null;
    ws.getCell(`${PART3.evidenceCol}${r}`).value = result === 'full' ? PART3.compliant : result === 'na' ? PART3.na : null;
    const photos = input.photos.get(ownerKey({ kind: 'item', itemId: item.id })) ?? [];
    const height = rowHeightPoints(negative ? note : '', photos.length);
    ws.getRow(r).height = height;
    placePhotos(wb, ws, r, photos, height);
  }

  // Counts
  ws.getCell(COUNT_CELLS.negative).value = input.score.negatives;
  ws.getCell(COUNT_CELLS.positive).value = input.positives.length;

  // Positive observations
  input.positives.forEach((p, i) => {
    const r = PART3.positiveFirstRow + i;
    ws.getCell(`${PART3.questionCol}${r}`).value = PART3.positiveLabel;
    ws.getCell(`${PART3.noteCol}${r}`).value = p.text || null;
    const photos = input.photos.get(ownerKey({ kind: 'positive', positiveId: p.id })) ?? [];
    const height = rowHeightPoints(p.text, photos.length);
    ws.getRow(r).height = height;
    placePhotos(wb, ws, r, photos, height);
  });

  // Cached results for the template's formulas (Excel recalculates on open; previews show these)
  for (const section of input.score.sections) {
    setFormulaResult(ws, PART1_SCORE_CELL[section.id], ratioOrNa(section.ratio));
    const row = PART2_ROW[section.id];
    setFormulaResult(ws, `R${row}`, section.tally.possible);
    setFormulaResult(ws, `S${row}`, section.tally.points);
    setFormulaResult(ws, `T${row}`, ratioOrNa(section.ratio));
    for (const sub of section.subsections) {
      if (sub.id === section.id) continue; // section A's implicit subsection shares the section's cells
      setFormulaResult(ws, PART1_SCORE_CELL[sub.id], ratioOrNa(sub.ratio));
      const subRow = PART2_ROW[sub.id];
      setFormulaResult(ws, `R${subRow}`, sub.tally.possible);
      setFormulaResult(ws, `S${subRow}`, sub.tally.points);
      setFormulaResult(ws, `T${subRow}`, ratioOrNa(sub.ratio));
    }
  }
  setFormulaResult(ws, OVERALL_CELL, ratioOrNa(input.score.overall));

  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

export async function loadTemplate(): Promise<ArrayBuffer> {
  const res = await fetch(`${import.meta.env.BASE_URL}templates/hs-audit-template.xlsx`);
  if (!res.ok) throw new Error('The Excel template could not be loaded. Open the app once while online, then try again.');
  return res.arrayBuffer();
}

/** Gathers the audit from the database, builds the workbook and marks the audit exported. */
export async function exportExcel(auditId: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const audit = await repo.getAudit(auditId);
  if (!audit) throw new Error('audit not found');
  const [answerRows, positives, media, template] = await Promise.all([
    repo.getAnswers(auditId),
    repo.listPositives(auditId),
    repo.listMedia(auditId),
    loadTemplate(),
  ]);
  const answers = new Map(answerRows.map((a) => [a.itemId, a]));
  const results = new Map<string, Result | undefined>(answerRows.map((a) => [a.itemId, a.result]));
  const photos = new Map<string, Uint8Array[]>();
  for (const m of media) {
    if (m.type !== 'photo') continue;
    const key = ownerKey(m.owner);
    const list = photos.get(key) ?? [];
    list.push(new Uint8Array(m.data));
    photos.set(key, list);
  }
  const wb = await buildWorkbook(template, { audit, answers, positives, photos, score: scoreAudit(results) });
  const out = await wb.xlsx.writeBuffer();
  await repo.markExported(auditId);
  return { bytes: new Uint8Array(out as ArrayBuffer), filename: excelFilename(audit) };
}
