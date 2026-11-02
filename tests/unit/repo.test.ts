import { test, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { setWriter } from '../../src/sync/writer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWriter({ id: 'local', role: 'auditor' });
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
  expect((await repo.getAudit(a.id))!.activityAt).toBeGreaterThanOrEqual(a.updatedAt);
  expect(await db.outbox.count()).toBe(5); // create + four answer writes, every one queued for the team
});

test('listAudits filters: all, mine, archived, deleted', async () => {
  setWriter({ id: 'me', role: 'auditor' });
  const mine = await repo.createAudit({ auditNo: 'MINE' });
  setWriter({ id: 'other', role: 'lead' });
  const theirs = await repo.createAudit({ auditNo: 'THEIRS' });
  await repo.archiveAudit(theirs.id);
  expect((await repo.listAudits()).map((x) => x.header.auditNo)).toEqual(['MINE']);
  expect((await repo.listAudits({ filter: 'mine', me: 'me' })).map((x) => x.header.auditNo)).toEqual(['MINE']);
  expect((await repo.listAudits({ filter: 'mine', me: 'other' })).map((x) => x.header.auditNo)).toEqual([]);
  expect((await repo.listAudits({ filter: 'archived' })).map((x) => x.header.auditNo)).toEqual(['THEIRS']);
  expect((await repo.listAudits())[0]).toMatchObject({ createdBy: 'me', activityBy: 'me', pending: 1 });
  await repo.deleteAudit(mine.id, 'MINE');
  expect(await repo.listAudits()).toEqual([]);
  expect((await repo.listAudits({ filter: 'deleted' })).map((x) => x.header.auditNo)).toEqual(['MINE']);
  await repo.restoreAudit(mine.id);
  expect((await repo.listAudits()).map((x) => x.header.auditNo)).toEqual(['MINE']);
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

test('archive hides; delete for the team is gated by the typed audit number and is soft', async () => {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004' });
  await repo.setResult(a.id, 'A1', 'no');
  const m = await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', data: new Uint8Array([1]).buffer, mime: 'image/jpeg' });
  await repo.archiveAudit(a.id);
  expect(await repo.listAudits()).toEqual([]);
  expect((await repo.listAudits({ filter: 'archived' })).length).toBe(1);
  await expect(repo.deleteAudit(a.id, 'HSSEW-003')).rejects.toThrow(/does not match/);
  expect((await repo.getAudit(a.id))!.deletedAt).toBeUndefined();
  await repo.deleteAudit(a.id, 'HSSEW-004');
  expect((await repo.getAudit(a.id))!.deletedAt).toBeGreaterThan(0);
  expect(await db.answers.count()).toBe(1); // soft: nothing of the team's is destroyed
  expect(await db.mediaBlobs.get(m.id)).toBeDefined(); // still waiting to upload, so the bytes stay (uploaded ones are freed; see below)
  expect((await db.outbox.toArray()).at(-1)!.change.fields).toMatchObject({ deleted_at: expect.any(Number) });
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
  expect((await repo.getMedia(photo.id))!.fromThumb).toBeUndefined();
  await db.mediaBlobs.delete(photo.id); // a teammate's photo whose full bytes are not here yet
  const partial = (await repo.getMedia(photo.id))!;
  expect(partial.fromThumb).toBe(true);
  expect(new Uint8Array(partial.data)).toEqual(new Uint8Array([3]));
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

test('delete for the team keeps the bytes of photos that have not been uploaded yet', async () => {
  const a = await repo.createAudit({ auditNo: 'HSSEW-070' });
  const pending = await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', data: new Uint8Array([1]).buffer, mime: 'image/jpeg' });
  const uploaded = await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A2' }, type: 'photo', data: new Uint8Array([2]).buffer, mime: 'image/jpeg' });
  await db.media.update(uploaded.id, { uploadedAt: 5 });
  await db.outbox.where('key').equals(`hs_photos:${uploaded.id}`).delete(); // its upload already happened
  await repo.deleteAudit(a.id, 'HSSEW-070');
  expect(await db.mediaBlobs.get(pending.id)).toBeDefined(); // still queued: the team must still get it
  expect(await db.mediaBlobs.get(uploaded.id)).toBeUndefined(); // on the server already: free the space
});

