// Usage: node scripts/extract-checklist.mjs <template.xlsx> <out.json>
// Reads sections, subsections and weighted items from rows 8–109 of the template sheet.
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: extract-checklist.mjs <template.xlsx> <out.json>');
  process.exit(1);
}

const TEMPLATE_VERSION = 'book2-2026-10';
const SECTION_ID = /^[ABC]$/;
const SUBSECTION_ID = /^[BC]\d+$/;
const ITEM_ID = /^[ABC]\d+(\.\d+)?$/;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(src);
const ws = wb.worksheets[0];

const text = (cell) => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
  return String(v);
};

const sections = [];
let section = null;
let subsection = null;

for (let r = 8; r <= 109; r++) {
  const id = text(ws.getCell(`B${r}`)).trim();
  const title = text(ws.getCell(`C${r}`)).trim();
  const weightCell = ws.getCell(`S${r}`).value;
  const isFormula = weightCell && typeof weightCell === 'object' && 'formula' in weightCell;

  if (SECTION_ID.test(id)) {
    section = { id, title, subsections: [] };
    sections.push(section);
    subsection = null;
    if (id === 'A') {
      subsection = { id: 'A', title, implicit: true, items: [] };
      section.subsections.push(subsection);
    }
  } else if (SUBSECTION_ID.test(id) && isFormula) {
    subsection = { id, title, implicit: false, items: [] };
    section.subsections.push(subsection);
  } else if (ITEM_ID.test(id) && typeof weightCell === 'number') {
    subsection.items.push({ id, text: title, weight: weightCell, row: r });
  }
}

writeFileSync(out, JSON.stringify({ templateVersion: TEMPLATE_VERSION, sections }, null, 2) + '\n');
const count = sections.flatMap((s) => s.subsections.flatMap((x) => x.items)).length;
console.log(`wrote ${out}: ${sections.length} sections, ${count} items`);
