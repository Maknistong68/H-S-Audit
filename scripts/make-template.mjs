// Usage: node scripts/make-template.mjs <Book2.xlsx> <out.xlsx>
//
// Produces the clean export template from the audit workbook:
//   stage 1 (zip surgery) removes the "Place in Cell" evidence pictures
//   (~13 MB of rich-value parts ExcelJS cannot touch) and the dead external link;
//   stage 2 (ExcelJS) clears audit data, cached scores and row heights.
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import ExcelJS from 'exceljs';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: make-template.mjs <Book2.xlsx> <out.xlsx>');
  process.exit(1);
}

// ---- stage 1: strip rich-value pictures, metadata, external links, calc chain
const DROP_PART = /^(xl\/media\/|xl\/richData\/|xl\/metadata\.xml$|xl\/externalLinks\/|xl\/calcChain\.xml$)/;
const DROP_TARGET = /(richData\/|metadata\.xml|externalLinks\/|calcChain\.xml)/;

const parts = unzipSync(new Uint8Array(readFileSync(src)));
const kept = {};
for (const [name, data] of Object.entries(parts)) {
  if (!DROP_PART.test(name)) kept[name] = data;
}

const editText = (name, fn) => {
  kept[name] = strToU8(fn(strFromU8(kept[name])));
};

editText('xl/_rels/workbook.xml.rels', (xml) =>
  xml.replace(/<Relationship [^>]*\/>/g, (rel) => (DROP_TARGET.test(rel) ? '' : rel)),
);
editText('[Content_Types].xml', (xml) =>
  xml.replace(/<Override [^>]*\/>/g, (o) => (DROP_TARGET.test(o) ? '' : o)),
);
editText('xl/worksheets/sheet1.xml', (xml) => xml.replace(/ vm="\d+"/g, ''));
editText('xl/workbook.xml', (xml) =>
  xml
    .replace(/<externalReferences>.*?<\/externalReferences>/s, '')
    .replace(/<definedName name="(EndDate|EndWeight|StartDate)"[^>]*>[^<]*<\/definedName>/g, ''),
);

const stripped = zipSync(kept, { level: 6 });

// ---- stage 2: clear audit content with ExcelJS
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(stripped);
const ws = wb.worksheets[0];

const HEADER_CELLS = [
  'D2', 'Q2', 'D3', 'Q3', 'D4', 'Q4',
  'D113', 'Q113', 'D114', 'Q114', 'D115', 'Q115',
  'D147', 'Q147', 'D148', 'Q148', 'D149', 'Q149',
];
for (const c of HEADER_CELLS) ws.getCell(c).value = null;

const ITEM_ID = /^[ABC]\d+(\.\d+)?$/;
for (let r = 9; r <= 109; r++) {
  const id = ws.getCell(`B${r}`).value;
  const weight = ws.getCell(`S${r}`).value;
  if (typeof id === 'string' && ITEM_ID.test(id) && typeof weight === 'number') {
    ws.getCell(`T${r}`).value = null;
    ws.getCell(`U${r}`).value = null;
  }
}

ws.getCell('H152').value = null;
ws.getCell('P152').value = null;

for (let r = 155; r <= 235; r++) {
  for (const col of ['B', 'C', 'H', 'R']) ws.getCell(`${col}${r}`).value = null;
}
for (let r = 236; r <= 322; r++) {
  ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
    cell.value = null;
  });
}
for (let r = 155; r <= 322; r++) ws.getRow(r).height = 30;

// Drop cached score results so a template opened by itself shows no stale numbers.
const SCORE_CELLS = [
  'S24', 'S75', 'S110',
  'S27', 'S30', 'S35', 'S39', 'S42', 'S46', 'S56', 'S59', 'S61', 'S65', 'S68', 'S72', 'S78', 'S91',
];
for (let r = 120; r <= 137; r++) for (const col of ['R', 'S', 'T']) SCORE_CELLS.push(`${col}${r}`);
for (const addr of SCORE_CELLS) {
  const cell = ws.getCell(addr);
  const v = cell.value;
  if (v && typeof v === 'object' && 'formula' in v) cell.value = { ...v, result: undefined };
}

wb.calcProperties.fullCalcOnLoad = true;
const buf = await wb.xlsx.writeBuffer();
writeFileSync(out, Buffer.from(buf));
console.log(`wrote ${out} (${buf.byteLength} bytes; stripped zip was ${stripped.length} bytes)`);
