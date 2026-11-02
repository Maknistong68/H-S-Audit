import { test, expect, beforeEach } from 'vitest';
import { buildBackup, importBackup } from '../../src/db/backup';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { listLocalOnly, uploadAllLocal, uploadAudit } from '../../src/sync/uploadLocal';
import { setWriter } from '../../src/sync/writer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWriter({ id: 'user-auditor', role: 'auditor' });
});

async function seedLocalOnly(id: string) {
  // Rows as the app wrote them before accounts existed: no fieldAt, no createdBy, marked local-only by the upgrade.
  await db.audits.put({ id, templateVersion: 'book2-2026-10', status: 'draft', header: { contractorWo: 'WO', projectName: 'P', auditors: 'J', auditDate: '2026-10-28', auditNo: 'OLD-1', contactNumber: '' }, createdAt: 100, updatedAt: 200, localOnly: true });
  await db.answers.put({ id: `${id}:A1`, auditId: id, itemId: 'A1', result: 'no', note: 'n', flagged: false, repeated: true, updatedAt: 150 });
  await db.positives.put({ id: `${id}-p1`, auditId: id, text: 'Good', order: 0, updatedAt: 160 });
  await db.media.put({ id: `${id}-m1`, auditId: id, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', mime: 'image/jpeg', bytes: 2, width: 1, height: 1, thumb: new Uint8Array([9]).buffer, createdAt: 170 });
  await db.mediaBlobs.put({ id: `${id}-m1`, data: new Uint8Array([1, 2]).buffer });
  await db.media.put({ id: `${id}-a1`, auditId: id, owner: { kind: 'item', itemId: 'A1' }, type: 'audio', mime: 'audio/mp4', bytes: 1, createdAt: 180 });
  await db.mediaBlobs.put({ id: `${id}-a1`, data: new Uint8Array([1]).buffer });
}

test('uploadAudit queues the audit, its answers, positives and photos in order and clears localOnly', async () => {
  await seedLocalOnly('old');
  expect((await listLocalOnly()).map((a) => a.id)).toEqual(['old']);
  await uploadAudit('old');
  const entries = await db.outbox.orderBy('seq').toArray();
  expect(entries.map((e) => `${e.kind}:${e.table}`)).toEqual(['patch:hs_audits', 'patch:hs_answers', 'patch:hs_positives', 'photo:hs_photos']);
  expect(entries[0].change).toMatchObject({ key: { id: 'old' }, fields: { audit_no: 'OLD-1', contractor_wo: 'WO', audit_date: '2026-10-28', status: 'draft', template_version: 'book2-2026-10', created_at: 100 }, at: 200 });
  expect(entries[1].change).toMatchObject({ key: { audit_id: 'old', item_id: 'A1' }, fields: { result: 'no', note: 'n', flagged: false, repeated: true }, at: 150 });
  expect(entries[2].change.fields).toMatchObject({ audit_id: 'old', text: 'Good', position: 0 });
  expect(entries[3].change.fields).toMatchObject({ audit_id: 'old', owner_kind: 'item', owner_id: 'A1', storage_path: 'old/old-m1.jpg', uploaded_at: null, thumb: 'CQ==' });
  expect((await db.audits.get('old'))!.localOnly).toBe(false);
  expect((await db.audits.get('old'))!.createdBy).toBe('user-auditor');
  expect((await db.answers.get('old:A1'))!.fieldAt).toMatchObject({ result: 150, note: 150 });
  expect(await listLocalOnly()).toEqual([]);
  expect(await db.mediaBlobs.get('old-a1')).toBeDefined(); // the memo stays on this phone, unqueued
});

test('uploadAllLocal uploads every local-only audit and returns the count', async () => {
  await seedLocalOnly('old-a');
  await seedLocalOnly('old-b');
  await repo.createAudit({ auditNo: 'NEW' }); // already a team audit
  expect(await uploadAllLocal()).toBe(2);
  expect(await listLocalOnly()).toEqual([]);
  expect((await db.outbox.toArray()).filter((e) => e.table === 'hs_audits')).toHaveLength(3);
});

test('a backup import becomes a team audit with queued changes', async () => {
  const a = await repo.createAudit({ auditNo: 'HSSEW-004' });
  await repo.setResult(a.id, 'A1', 'partial');
  const { bytes } = await buildBackup(a.id);
  await db.outbox.clear();
  const { auditId } = await importBackup(bytes);
  expect((await db.audits.get(auditId))!.localOnly).toBe(false);
  const entries = await db.outbox.orderBy('seq').toArray();
  expect(entries.map((e) => e.table)).toEqual(['hs_audits', 'hs_answers']);
  expect(entries[0].change.key).toEqual({ id: auditId });
});
