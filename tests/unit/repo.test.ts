import { test, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('create, answer, progress', async () => {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004' });
  expect(a.status).toBe('draft');
  expect(a.header.auditDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(a.templateVersion).toBe('book2-2026-10');
  await repo.setResult(a.id, 'A1', 'full');
  await repo.setFlag(a.id, 'B1.1', true);
  await repo.setNote(a.id, 'A1', 'ok');
  const [s] = await repo.listAudits();
  expect(s).toMatchObject({ answered: 1, flagged: 1, total: 81 });
  const ans = await repo.getAnswers(a.id);
  expect(ans.find((x) => x.itemId === 'A1')).toMatchObject({ result: 'full', note: 'ok', flagged: false, repeated: false });
  await repo.setResult(a.id, 'A1', undefined);
  expect((await repo.listAudits())[0].answered).toBe(0);
  expect((await repo.getAudit(a.id))!.updatedAt).toBeGreaterThanOrEqual(a.updatedAt);
});

test('positives and media soft delete', async () => {
  const a = await repo.createAudit();
  const p = await repo.addPositive(a.id, 'Good housekeeping');
  await repo.addPositive(a.id, 'Signage');
  await repo.removePositive(p.id);
  expect((await repo.listPositives(a.id)).map((x) => x.text)).toEqual(['Signage']);
  const m = await repo.addMedia({
    auditId: a.id,
    owner: { kind: 'item', itemId: 'B9.1' },
    type: 'photo',
    data: new Uint8Array([1, 2, 3]).buffer,
    mime: 'image/jpeg',
    width: 4,
    height: 3,
  });
  expect(m.bytes).toBe(3);
  await repo.softDeleteMedia(m.id);
  expect(await repo.listMedia(a.id)).toEqual([]);
  expect((await repo.listMedia(a.id, { includeDeleted: true })).length).toBe(1);
  await repo.restoreMedia(m.id);
  expect((await repo.listMedia(a.id, { owner: { kind: 'item', itemId: 'B9.1' } })).length).toBe(1);
});

test('archive hides, purge is gated by typed audit number', async () => {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004' });
  await repo.setResult(a.id, 'A1', 'no');
  await repo.archiveAudit(a.id);
  expect(await repo.listAudits()).toEqual([]);
  expect((await repo.listAudits({ includeArchived: true })).length).toBe(1);
  await expect(repo.purgeAudit(a.id, 'HSSEW-003')).rejects.toThrow(/does not match/);
  expect(await db.answers.count()).toBe(1);
  await repo.purgeAudit(a.id, 'HSSEW-004');
  expect(await db.audits.count()).toBe(0);
  expect(await db.answers.count()).toBe(0);
});

test('tags: defaults, overrides, custom', async () => {
  expect(await repo.getItemTags('B11.1')).toEqual(['clinic']);
  await repo.setItemTags('B11.1', ['clinic', 'site-walk']);
  expect(await repo.getItemTags('B11.1')).toEqual(['clinic', 'site-walk']);
  const t = await repo.addTag('Welfare');
  expect(t).toMatchObject({ id: 'welfare', label: 'Welfare', builtIn: false });
  await expect(repo.addTag('welfare')).rejects.toThrow();
  await repo.renameTag('welfare', 'Welfare & Camps');
  const all = await repo.listTags();
  expect(all.length).toBe(18);
  expect(all.at(-1)!.label).toBe('Welfare & Camps');
});

test('appendNote and appendPositiveText read the current text inside the write', async () => {
  const a = await repo.createAudit();
  await repo.appendNote(a.id, 'A1', 'first');
  await repo.setNote(a.id, 'A1', 'typed');
  await repo.appendNote(a.id, 'A1', 'dictated');
  expect((await repo.getAnswers(a.id)).find((x) => x.itemId === 'A1')!.note).toBe('typed dictated');
  const p = await repo.addPositive(a.id, 'Good');
  await repo.appendPositiveText(p.id, 'housekeeping');
  expect((await repo.listPositives(a.id))[0].text).toBe('Good housekeeping');
});

test('media bytes live apart from media metadata', async () => {
  const a = await repo.createAudit();
  const photo = await repo.addMedia({
    auditId: a.id,
    owner: { kind: 'item', itemId: 'A1' },
    type: 'photo',
    data: new Uint8Array([1, 2]).buffer,
    mime: 'image/jpeg',
    thumb: new Uint8Array([3]).buffer,
  });
  await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'audio', data: new Uint8Array([4, 5, 6]).buffer, mime: 'audio/mp4' });
  const meta = await repo.listMediaMeta(a.id);
  expect(meta.length).toBe(2);
  for (const m of meta) expect('data' in m).toBe(false);
  expect(meta.find((m) => m.type === 'photo')!.thumb?.byteLength).toBe(1);
  expect(meta.find((m) => m.type === 'audio')!.bytes).toBe(3);
  expect(new Uint8Array((await repo.getMedia(photo.id))!.data)).toEqual(new Uint8Array([1, 2]));
  expect((await repo.listMedia(a.id, { type: 'photo' })).map((m) => m.type)).toEqual(['photo']);
  expect((await db.table('media').get(photo.id) as { data?: unknown }).data).toBeUndefined();
});

test('upgrades a v1 database that still stores bytes inside media rows', async () => {
  await db.close();
  await db.delete();
  const v1 = new Dexie('hs-audit');
  v1.version(1).stores({
    audits: 'id, status, updatedAt',
    answers: 'id, auditId',
    positives: 'id, auditId',
    media: 'id, auditId, [auditId+type]',
    snapshots: 'id, auditId, createdAt',
    tagOverrides: 'itemId',
    tags: 'id',
    settings: 'key',
  });
  await v1.table('audits').add({ id: 'a1', templateVersion: 'book2-2026-10', status: 'draft', header: { contractorWo: '', projectName: '', auditors: '', auditDate: '2026-10-28', auditNo: 'OLD', contactNumber: '' }, createdAt: 1, updatedAt: 1 });
  await v1.table('media').add({ id: 'm1', auditId: 'a1', owner: { kind: 'item', itemId: 'A1' }, type: 'photo', data: new Uint8Array([7, 7]).buffer, mime: 'image/jpeg', bytes: 2, createdAt: 1 });
  v1.close();
  await db.open(); // Dexie does not auto-reopen after an explicit close; opening runs the v2 upgrade
  const media = await repo.listMedia('a1');
  expect(media.length).toBe(1);
  expect(new Uint8Array(media[0].data)).toEqual(new Uint8Array([7, 7]));
  expect((await db.table('media').get('m1') as { data?: unknown }).data).toBeUndefined();
});

test('listAudits tolerates a row with a broken header', async () => {
  await db.audits.add({ id: 'bad', templateVersion: 'x', status: 'draft', createdAt: 1, updatedAt: 1 } as unknown as Parameters<typeof db.audits.add>[0]);
  const [s] = await repo.listAudits();
  expect(s.header.auditNo).toBe('');
  expect(s.header.auditDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('settings', async () => {
  expect(await repo.getSetting('lang', 'en-US')).toBe('en-US');
  await repo.setSetting('lang', 'ar-SA');
  expect(await repo.getSetting('lang', 'en-US')).toBe('ar-SA');
});
