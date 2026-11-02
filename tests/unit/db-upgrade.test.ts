import { test, expect } from 'vitest';
import Dexie from 'dexie';

const V1_STORES = {
  audits: 'id, status, updatedAt',
  answers: 'id, auditId',
  positives: 'id, auditId',
  media: 'id, auditId, [auditId+type]',
  snapshots: 'id, auditId, createdAt',
  tagOverrides: 'itemId',
  tags: 'id',
  settings: 'key',
};

test('version 3 marks audits made before sign-in as local-only and adds the sync tables', async () => {
  await Dexie.delete('hs-audit');
  const old = new Dexie('hs-audit');
  old.version(1).stores(V1_STORES);
  old.version(2).stores({ ...V1_STORES, mediaBlobs: 'id' });
  await old.open();
  await old.table('audits').put({ id: 'old-1', templateVersion: 'book2-2026-10', status: 'draft', header: {}, createdAt: 1, updatedAt: 1 });
  old.close();

  const { db } = await import('../../src/db/db');
  await db.open();
  expect(db.verno).toBe(3);
  expect(await db.audits.get('old-1')).toMatchObject({ localOnly: true });
  expect(await db.outbox.count()).toBe(0);
  expect(await db.members.count()).toBe(0);
  expect(await db.contractors.count()).toBe(0);
  await db.audits.put({ id: 'new-1', templateVersion: 'book2-2026-10', status: 'draft', header: { contractorWo: '', projectName: '', auditors: '', auditDate: '', auditNo: '', contactNumber: '' }, createdAt: 2, updatedAt: 2, deletedAt: 5 });
  expect((await db.audits.where('deletedAt').above(0).toArray()).map((a) => a.id)).toEqual(['new-1']);
  db.close();
});
