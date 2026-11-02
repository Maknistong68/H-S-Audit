import { test, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/db';
import { applyIncoming, pendingCounts, pendingFor, writeChange, writePhoto } from '../../src/sync/outbox';
import { ReadOnlyError, setWriter } from '../../src/sync/writer';
import type { RemoteRow } from '../../src/sync/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWriter({ id: 'local', role: 'auditor' });
});

const createAudit = () => writeChange({ table: 'hs_audits', key: { id: 'a' }, fields: { audit_no: 'X', status: 'draft', template_version: 'book2-2026-10', created_at: 1 } });

test('writeChange updates the row and queues one entry with the same at', async () => {
  await createAudit();
  await writeChange({ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'full' } });
  const entries = await db.outbox.orderBy('seq').toArray();
  expect(entries.map((e) => e.key)).toEqual(['hs_audits:a', 'hs_answers:a:A1']);
  expect(entries.map((e) => e.auditId)).toEqual(['a', 'a']);
  expect(entries[1]).toMatchObject({ kind: 'patch', attempts: 0 });
  const answer = await db.answers.get('a:A1');
  expect(answer).toMatchObject({ auditId: 'a', itemId: 'A1', result: 'full', updatedBy: 'local', fieldAt: { result: entries[1].change.at } });
  const audit = await db.audits.get('a');
  expect(audit).toMatchObject({ header: { auditNo: 'X' }, activityAt: entries[1].change.at, activityBy: 'local', fieldAt: { audit_no: entries[0].change.at } });
});

test('a later write to the same field gets a strictly newer timestamp', async () => {
  await createAudit();
  await writeChange({ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { note: 'one' }, at: 5_000_000_000_000 }); // far future
  await writeChange({ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { note: 'two' } });
  const answer = await db.answers.get('a:A1');
  expect(answer!.note).toBe('two');
  expect(answer!.fieldAt!.note).toBe(5_000_000_000_001);
});

test('a viewer cannot write', async () => {
  setWriter({ id: 'v', role: 'viewer' });
  await expect(createAudit()).rejects.toBeInstanceOf(ReadOnlyError);
  expect(await db.outbox.count()).toBe(0);
  expect(await db.audits.count()).toBe(0);
});

test('applyIncoming keeps newer pending fields on top of the server row', async () => {
  await createAudit();
  const t = Date.now() + 10_000; // the teammate's clock is a little ahead of the audit creation above
  await writeChange({ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { note: 'pending' }, at: t + 30 });
  const incoming: RemoteRow = { audit_id: 'a', item_id: 'A1', result: 'no', note: 'theirs', flagged: false, repeated: false, updated_at: t + 40, updated_by: 'u2', field_at: { result: t + 40, note: t + 20 }, server_at: '2026-11-02T10:00:00Z' };
  await applyIncoming('hs_answers', incoming);
  const answer = await db.answers.get('a:A1');
  expect(answer).toMatchObject({ result: 'no', note: 'pending', serverAt: '2026-11-02T10:00:00Z', fieldAt: { result: t + 40, note: t + 30 } });
  expect((await db.audits.get('a'))!.activityAt).toBe(t + 40);
  expect((await db.audits.get('a'))!.activityBy).toBe('u2');
  expect(await pendingFor('hs_answers:a:A1')).toHaveLength(1);
});

test('applyIncoming creates rows this phone has never seen, including the audit itself', async () => {
  await applyIncoming('hs_audits', { id: 'b', audit_no: 'B', contractor_wo: '', project_name: '', auditors: '', audit_date: null, contact_number: '', contractor_id: null, status: 'draft', template_version: 't', last_export_at: null, deleted_at: null, created_by: 'u2', created_at: 1, updated_at: 2, updated_by: 'u2', field_at: { audit_no: 2 } });
  expect(await db.audits.get('b')).toMatchObject({ header: { auditNo: 'B' }, createdBy: 'u2', activityAt: 2, activityBy: 'u2' });
  expect(await db.outbox.count()).toBe(0);
});

test('pendingCounts groups by audit', async () => {
  await createAudit();
  await writeChange({ table: 'hs_audits', key: { id: 'b' }, fields: { audit_no: 'Y', status: 'draft', template_version: 't', created_at: 1 } });
  await writeChange({ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'full' } });
  const counts = await pendingCounts();
  expect(counts.total).toBe(3);
  expect(counts.byAudit.get('a')).toBe(2);
  expect(counts.byAudit.get('b')).toBe(1);
});

test('writePhoto stores the row and bytes and queues a photo entry with a base64 thumb', async () => {
  await createAudit();
  const data = new Uint8Array([1, 2, 3, 4]).buffer;
  const thumb = new Uint8Array([9, 9]).buffer;
  await writePhoto({ id: 'm1', auditId: 'a', owner: { kind: 'item', itemId: 'A1' }, type: 'photo', mime: 'image/jpeg', bytes: 4, width: 2, height: 2, thumb, createdAt: 7 }, data);
  const entry = (await db.outbox.orderBy('seq').last())!;
  expect(entry).toMatchObject({ kind: 'photo', table: 'hs_photos', key: 'hs_photos:m1', auditId: 'a' });
  expect(entry.change.fields).toMatchObject({ audit_id: 'a', owner_kind: 'item', owner_id: 'A1', storage_path: 'a/m1.jpg', uploaded_at: null, bytes: 4, created_at: 7 });
  expect(entry.change.fields.thumb).toBe('CQk=');
  expect(await db.mediaBlobs.get('m1')).toMatchObject({ id: 'm1' });
  expect(await db.media.get('m1')).toMatchObject({ storagePath: 'a/m1.jpg', createdBy: 'local', updatedAt: entry.change.at });
});
