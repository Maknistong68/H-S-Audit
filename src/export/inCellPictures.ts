import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Excel "Place in Cell" pictures, written the way Excel itself writes them (and the way Book2 stores its
 * evidence photos): the cell holds an error value with a value-metadata index, which points through
 * xl/metadata.xml to a rich value of type _localImage, which points through richValueRel to the image.
 * ExcelJS cannot write these, so they are added to the finished .xlsx package.
 */
export interface InCellPicture {
  /** Cell reference on the first worksheet, e.g. "R155". */
  cell: string;
  jpeg: Uint8Array;
}

const SHEET = 'xl/worksheets/sheet1.xml';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_RD = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
const NS_RD2 = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata2';
const NS_RVREL = 'http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function metadataXml(n: number): string {
  const future = Array.from({ length: n }, (_, i) => `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${i}"/></ext></extLst></bk>`).join('');
  const values = Array.from({ length: n }, (_, i) => `<bk><rc t="1" v="${i}"/></bk>`).join('');
  return (
    XML +
    `<metadata xmlns="${NS_MAIN}" xmlns:xlrd="${NS_RD}">` +
    `<metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes>` +
    `<futureMetadata name="XLRICHVALUE" count="${n}">${future}</futureMetadata>` +
    `<valueMetadata count="${n}">${values}</valueMetadata></metadata>`
  );
}

const richValueXml = (n: number) =>
  XML + `<rvData xmlns="${NS_RD}" count="${n}">` + Array.from({ length: n }, (_, i) => `<rv s="0"><v>${i}</v><v>5</v></rv>`).join('') + '</rvData>';

const structureXml = () =>
  XML + `<rvStructures xmlns="${NS_RD}" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>`;

const typesXml = () =>
  XML +
  `<rvTypesInfo xmlns="${NS_RD2}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" xmlns:x="${NS_MAIN}"><global><keyFlags>` +
  ['_Self', '_DisplayString', '_Flags', '_Format', '_SubLabel', '_Attribution', '_Icon', '_Display', '_CanonicalPropertyNames', '_ClassificationId']
    .map((k) => `<key name="${k}">${k === '_Self' ? '<flag name="ExcludeFromFile" value="1"/>' : ''}<flag name="ExcludeFromCalcComparison" value="1"/></key>`)
    .join('') +
  '</keyFlags></global></rvTypesInfo>';

const relsListXml = (n: number) =>
  XML + `<richValueRels xmlns="${NS_RVREL}" xmlns:r="${NS_REL}">` + Array.from({ length: n }, (_, i) => `<rel r:id="rId${i + 1}"/>`).join('') + '</richValueRels>';

const relsXml = (names: string[]) =>
  XML +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  names.map((name, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/image" Target="../media/${name}"/>`).join('') +
  '</Relationships>';

/** Replace a cell (self-closing or with content) with an in-cell picture reference, keeping its style. */
function setPictureCell(sheet: string, ref: string, vm: number): string {
  const re = new RegExp(`<c r="${ref}"(?=[\\s>/])([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const match = sheet.match(re);
  const style = match?.[1].match(/\ss="(\d+)"/)?.[1];
  const cell = `<c r="${ref}"${style ? ` s="${style}"` : ''} t="e" vm="${vm}"><v>#VALUE!</v></c>`;
  if (match) return sheet.replace(re, cell);
  // the cell does not exist yet: append it to its row, keeping cells in column order is not required by Excel
  const row = ref.replace(/^[A-Z]+/, '');
  const rowRe = new RegExp(`(<row r="${row}"[^>]*?)(/>|>)`);
  if (!rowRe.test(sheet)) throw new Error(`row ${row} not found for picture ${ref}`);
  return sheet.replace(rowRe, (_m, open: string, close: string) => (close === '/>' ? `${open}>${cell}</row>` : `${open}>${cell}`));
}

export function placeInCellPictures(xlsx: Uint8Array, pictures: InCellPicture[]): Uint8Array {
  if (pictures.length === 0) return xlsx;
  const files = unzipSync(xlsx);
  if (files['xl/metadata.xml'] || files['xl/richData/rdrichvalue.xml']) throw new Error('workbook already has rich values');

  const names = pictures.map((_, i) => `incell${i + 1}.jpeg`);
  pictures.forEach((p, i) => {
    files[`xl/media/${names[i]}`] = new Uint8Array(p.jpeg);
  });

  let sheet = strFromU8(files[SHEET]);
  pictures.forEach((p, i) => {
    sheet = setPictureCell(sheet, p.cell, i + 1);
  });
  files[SHEET] = strToU8(sheet);

  const n = pictures.length;
  files['xl/metadata.xml'] = strToU8(metadataXml(n));
  files['xl/richData/rdrichvalue.xml'] = strToU8(richValueXml(n));
  files['xl/richData/rdrichvaluestructure.xml'] = strToU8(structureXml());
  files['xl/richData/rdRichValueTypes.xml'] = strToU8(typesXml());
  files['xl/richData/richValueRel.xml'] = strToU8(relsListXml(n));
  files['xl/richData/_rels/richValueRel.xml.rels'] = strToU8(relsXml(names));

  let types = strFromU8(files['[Content_Types].xml']);
  if (!/Extension="jpeg"/i.test(types)) types = types.replace('<Default ', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default ');
  const overrides = [
    ['/xl/metadata.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml'],
    ['/xl/richData/richValueRel.xml', 'application/vnd.ms-excel.richvaluerel+xml'],
    ['/xl/richData/rdrichvalue.xml', 'application/vnd.ms-excel.rdrichvalue+xml'],
    ['/xl/richData/rdrichvaluestructure.xml', 'application/vnd.ms-excel.rdrichvaluestructure+xml'],
    ['/xl/richData/rdRichValueTypes.xml', 'application/vnd.ms-excel.rdrichvaluetypes+xml'],
  ];
  types = types.replace('</Types>', overrides.map(([part, ct]) => `<Override PartName="${part}" ContentType="${ct}"/>`).join('') + '</Types>');
  files['[Content_Types].xml'] = strToU8(types);

  let wbRels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const rels = [
    ['http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata', 'metadata.xml'],
    ['http://schemas.microsoft.com/office/2022/10/relationships/richValueRel', 'richData/richValueRel.xml'],
    ['http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue', 'richData/rdrichvalue.xml'],
    ['http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure', 'richData/rdrichvaluestructure.xml'],
    ['http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueTypes', 'richData/rdRichValueTypes.xml'],
  ];
  wbRels = wbRels.replace('</Relationships>', rels.map(([type, target], i) => `<Relationship Id="rIdIncell${i + 1}" Type="${type}" Target="${target}"/>`).join('') + '</Relationships>');
  files['xl/_rels/workbook.xml.rels'] = strToU8(wbRels);

  return zipSync(files, { level: 6 });
}
