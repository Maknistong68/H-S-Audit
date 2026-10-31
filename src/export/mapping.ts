import type { AuditHeader } from '../db/db';
import type { Result } from '../domain/types';

/** Header values are written three times: Part 1, Part 2 and Part 3 each repeat the audit header. */
export const HEADER_CELLS: Record<keyof AuditHeader, string[]> = {
  contractorWo: ['D2', 'D113', 'D147'],
  projectName: ['D3', 'D114', 'D148'],
  auditors: ['D4', 'D115', 'D149'],
  auditDate: ['Q2', 'Q113', 'Q147'],
  auditNo: ['Q3', 'Q114', 'Q148'],
  contactNumber: ['Q4', 'Q115', 'Q149'],
};

export const RESULT_COL = 'T';
export const NOTE_COL = 'U';

export const RESULT_LABEL: Record<Result, string> = { full: 'Full', partial: 'Partial', no: 'No', na: 'N/A' };

export const REPEATED_PREFIX = 'Repeated observation. ';

export const PART3 = {
  idCol: 'B',
  questionCol: 'C',
  noteCol: 'H',
  evidenceCol: 'R',
  /** 0-based column index of R, for image anchors. */
  evidenceColIndex0: 17,
  positiveFirstRow: 239,
  positiveLabel: 'Positive',
  compliant: 'COMPLIANT',
  na: 'N/A',
} as const;

export const COUNT_CELLS = { negative: 'H152', positive: 'P152' } as const;

/** Live formulas, the same ones Book2 uses, so Part 3 follows Part 1 when answers are edited in Excel. */
export const PART3_FORMULAS = {
  id: (row: number) => `B${row}`,
  question: (row: number) => `C${row}`,
  note: (row: number) => `IF(OR(T${row}="No",T${row}="Partial"),IF(U${row}="","",U${row}),"")`,
  evidence: (row: number) => `IF(T${row}="Full","COMPLIANT",IF(T${row}="N/A","N/A",""))`,
  negativeCount: 'COUNTIF(T9:T109,"No")+COUNTIF(T9:T109,"Partial")',
  positiveCount: 'COUNTIF(C239:C322,"Positive")',
} as const;

/** Part 1 "Section Score" / subsection score cells (cached ratio). */
export const PART1_SCORE_CELL: Record<string, string> = {
  A: 'S24', B: 'S75', C: 'S110',
  B1: 'S27', B2: 'S30', B3: 'S35', B4: 'S39', B5: 'S42', B6: 'S46', B7: 'S56', B8: 'S59', B9: 'S61', B10: 'S65', B11: 'S68', B12: 'S72',
  C1: 'S78', C2: 'S91',
};

/** Part 2 rows: R = possible points, S = points scored, T = ratio. */
export const PART2_ROW: Record<string, number> = {
  A: 120, B: 121,
  B1: 122, B2: 123, B3: 124, B4: 125, B5: 126, B6: 127, B7: 128, B8: 129, B9: 130, B10: 131, B11: 132, B12: 133,
  C: 134, C1: 135, C2: 136,
};

export const OVERALL_CELL = 'R137';

/** At most this many photos of one question are combined into its single in-cell picture. */
export const MAX_PHOTOS_PER_CELL = 4;

/** Row height that gives an in-cell evidence photo a readable size. */
export const PHOTO_ROW_PT = 110;

const LINE_PT = 12;
const MIN_ROW_PT = 30;
const MAX_ROW_PT = 409; // Excel's hard limit
const NOTE_CHARS_PER_LINE = 70;
const QUESTION_CHARS_PER_LINE = 140; // the question sits in the wide merged C:R range

export function textLines(text: string, charsPerLine: number): number {
  return text.split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length / charsPerLine)), 0);
}

/** Height of a Part 3 row holding `note` and, when `photoCount` > 0, an in-cell photo; in points. */
export function rowHeightPoints(note: string, photoCount: number): number {
  const forNote = textLines(note, NOTE_CHARS_PER_LINE) * LINE_PT + 6;
  const forPhoto = photoCount > 0 ? PHOTO_ROW_PT : 0;
  return Math.min(MAX_ROW_PT, Math.max(MIN_ROW_PT, forNote, forPhoto));
}

/** Height of a Part 1 item row: the question (merged C:R) and the note (U) both wrap. */
export function part1RowHeightPoints(question: string, note: string): number {
  const lines = Math.max(textLines(question, QUESTION_CHARS_PER_LINE), textLines(note, NOTE_CHARS_PER_LINE));
  return Math.min(MAX_ROW_PT, Math.max(MIN_ROW_PT, lines * LINE_PT + 6));
}
