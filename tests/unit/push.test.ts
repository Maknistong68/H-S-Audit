import { test, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { createFake } from '../../src/server/fakeRemote';
import { backoffMs, pushOnce } from '../../src/sync/push';
import { setWriter } from '../../src/sync/writer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWriter({ id: 'user-auditor', role: 'auditor' });
});

async function fakeSignedIn(email = 'auditor@test') {
  const fake = createFake();
  await fake.auth.signIn(email, 'test1234');
  return fake;
}

test('batches consecutive patches into one apply and clears the queue', async () => {
  const { remote, control } = await fakeSignedIn();
  const applySpy = vi.spyOn(remote, 'apply');
  const a = await repo.createAudit({ auditNo: 'HSSEW-010' });
  await repo.setResult(a.id, 'A1', 'no');
  await repo.setNote(a.id, 'A1', 'Plan outdated');
  expect(await pushOnce(remote)).toEqual({ sent: 3, left: 0 });
  expect(applySpy).toHaveBeenCalledTimes(1);
  expect(applySpy.mock.calls[0][0]).toHaveLength(3);
  expect(await db.outbox.count()).toBe(0);
  expect(control.rows('hs_audits')[0]).toMatchObject({ id: a.id, audit_no: 'HSSEW-010' });
  expect(control.rows('hs_answers')[0]).toMatchObject({ item_id: 'A1', result: 'no', note: 'Plan outdated' });
});

test('uploads a photo before its row and marks uploadedAt locally', async () => {
  const { remote, control } = await fakeSignedIn();
  const a = await repo.createAudit();
  const m = await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', data: new Uint8Array([1, 2, 3]).buffer, mime: 'image/jpeg', thumb: new Uint8Array([9]).buffer });
  await repo.setFlag(a.id, 'A1', true);
  const order: string[] = [];
  vi.spyOn(remote, 'uploadPhoto').mockImplementation(async (path) => {
    order.push(`upload:${path}`);
  });
  const realApply = remote.apply.bind(remote);
  vi.spyOn(remote, 'apply').mockImplementation(async (changes) => {
    order.push(`apply:${changes.map((c) => c.table).join(',')}`);
    return realApply(changes);
  });
  expect(await pushOnce(remote)).toEqual({ sent: 3, left: 0 });
  expect(order).toEqual(['apply:hs_audits', `upload:${a.id}/${m.id}.jpg`, 'apply:hs_photos', 'apply:hs_answers']);
  expect(control.rows('hs_photos')[0]).toMatchObject({ id: m.id, storage_path: `${a.id}/${m.id}.jpg`, uploaded_at: expect.any(Number), thumb: 'CQ==' });
  expect((await db.media.get(m.id))!.uploadedAt).toEqual(expect.any(Number));
  expect(await db.outbox.count()).toBe(0);
});

test('a network error keeps the queue and rethrows', async () => {
  const { remote, control } = await fakeSignedIn();
  await repo.createAudit();
  control.setOnline(false);
  await expect(pushOnce(remote)).rejects.toMatchObject({ kind: 'network' });
  expect(await db.outbox.count()).toBe(1);
  expect((await db.outbox.toArray())[0].attempts).toBe(0); // not counted against the entry
  control.setOnline(true);
  expect(await pushOnce(remote)).toEqual({ sent: 1, left: 0 });
});

test('permission error keeps the queue and reports', async () => {
  const { remote, control } = await fakeSignedIn();
  await repo.createAudit();
  await repo.setResult((await repo.listAudits())[0].id, 'A1', 'full');
  control.setRole('user-auditor', 'viewer');
  await expect(pushOnce(remote)).rejects.toMatchObject({ kind: 'permission' });
  const entries = await db.outbox.toArray();
  expect(entries).toHaveLength(2);
  expect(entries.every((e) => e.attempts === 1 && /row-level security/.test(e.lastError ?? ''))).toBe(true);
  control.setRole('user-auditor', 'auditor');
  expect(await pushOnce(remote)).toEqual({ sent: 2, left: 0 });
});

test('pushes as the account signed in at push time', async () => {
  const { remote, auth, control } = await fakeSignedIn();
  const a = await repo.createAudit({ auditNo: 'SHARED' });
  await auth.signOut();
  await auth.signIn('lead@test', 'test1234');
  await pushOnce(remote);
  expect(control.rows('hs_audits')[0]).toMatchObject({ id: a.id, updated_by: 'user-lead', created_by: 'user-lead' });
});

test('a validation error skips that batch, keeps later entries flowing and reports', async () => {
  const { remote, control } = await fakeSignedIn();
  const a = await repo.createAudit();
  await repo.setResult(a.id, 'A1', 'full');
  await repo.addMedia({ auditId: a.id, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', data: new Uint8Array([1]).buffer, mime: 'image/jpeg' });
  control.failNextApplyWith('validation');
  const result = await pushOnce(remote);
  expect(result.sent).toBe(1); // the photo
  expect(result.left).toBe(2);
  expect(result.failed).toMatch(/validation/);
  const entries = await db.outbox.toArray();
  expect(entries.map((e) => e.table)).toEqual(['hs_audits', 'hs_answers']);
  expect(entries.every((e) => e.attempts === 1)).toBe(true);
  expect(control.uploaded()).toHaveLength(1);
});

test('backoffMs doubles from 2 s and caps at 60 s', () => {
  expect(backoffMs(0)).toBe(2000);
  expect(backoffMs(3)).toBe(16000);
  expect(backoffMs(10)).toBe(60000);
});
