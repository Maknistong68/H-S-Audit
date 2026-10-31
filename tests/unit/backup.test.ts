import { test, expect, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { buildBackup, importBackup, audioExt } from '../../src/db/backup';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seed() {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004', contractorWo: 'WO-1' });
  await repo.setResult(a.id, 'A1', 'no');
  await repo.setNote(a.id, 'A1', 'note');
  await repo.setRepeated(a.id, 'A1', true);
  await repo.addPositive(a.id, 'Good');
  await repo.addMedia({
    auditId: a.id,
    owner: { kind: 'item', itemId: 'A1' },
    type: 'photo',
    data: new Uint8Array([9, 8, 7]).buffer,
    mime: 'image/jpeg',
    width: 1,
    height: 1,
  });
  await repo.addMedia({
    auditId: a.id,
    owner: { kind: 'item', itemId: 'A1' },
    type: 'audio',
    data: new Uint8Array([1]).buffer,
    mime: 'audio/mp4',
    durationMs: 1200,
  });
  return a;
}

test('zip layout', async () => {
  const a = await seed();
  const { bytes, filename } = await buildBackup(a.id);
  expect(filename).toBe('HSSEW-004-backup.zip');
  const files = unzipSync(bytes);
  const names = Object.keys(files).sort();
  expect(names.filter((n) => n.startsWith('photos/')).length).toBe(1);
  expect(names.some((n) => /^audio\/.+\.m4a$/.test(n))).toBe(true);
  const m = JSON.parse(strFromU8(files['audit.json']));
  expect(m.formatVersion).toBe(1);
  expect(m.audit.header.auditNo).toBe('HSSEW-004');
  expect(m.answers[0]).toMatchObject({ itemId: 'A1', result: 'no', note: 'note', repeated: true });
  const photoEntry = m.media.find((x: { type: string }) => x.type === 'photo');
  expect(photoEntry.file).toMatch(/^photos\/.+\.jpg$/);
  expect(Array.from(files[photoEntry.file])).toEqual([9, 8, 7]);
  expect((await repo.getAudit(a.id))!.lastExportAt).toBeGreaterThan(0);
});

test('import twice gives two independent audits', async () => {
  const a = await seed();
  const { bytes } = await buildBackup(a.id);
  const r1 = await importBackup(bytes);
  const r2 = await importBackup(bytes);
  expect(r1.auditId).not.toBe(a.id);
  expect(r2.auditId).not.toBe(r1.auditId);
  expect((await repo.listAudits()).length).toBe(3);
  for (const id of [r1.auditId, r2.auditId]) {
    expect((await repo.getAnswers(id)).find((x) => x.itemId === 'A1')).toMatchObject({ result: 'no', note: 'note', repeated: true });
    expect((await repo.listPositives(id)).map((p) => p.text)).toEqual(['Good']);
    const media = await repo.listMedia(id);
    expect(media.length).toBe(2);
    expect(Array.from(new Uint8Array(media.find((m) => m.type === 'photo')!.data))).toEqual([9, 8, 7]);
    expect((await repo.getAudit(id))!.importedAt).toBeGreaterThan(0);
  }
  expect(r1.warnings).toEqual([]);
});

test('audio extensions', () => {
  expect(audioExt('audio/webm;codecs=opus')).toBe('webm');
  expect(audioExt('audio/mp4')).toBe('m4a');
  expect(audioExt('audio/ogg')).toBe('ogg');
  expect(audioExt('x')).toBe('bin');
});
