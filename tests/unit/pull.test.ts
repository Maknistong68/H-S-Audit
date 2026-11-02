import { test, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { createFake } from '../../src/server/fakeRemote';
import { cursorFrom, pullOnce } from '../../src/sync/pull';
import { setWriter } from '../../src/sync/writer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWriter({ id: 'user-auditor', role: 'auditor' });
});

const auditCreate = (id: string, at: number, auditNo = 'X') => ({ table: 'hs_audits' as const, key: { id }, fields: { audit_no: auditNo, status: 'draft', template_version: 't', created_at: 1 }, at });

test('first pull loads everything and stores a cursor 60 s behind the newest row', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  control.teammate('lead', [auditCreate('a', 10, 'TEAM-1'), { table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'no', note: 'n' }, at: 11 }]);
  expect(await pullOnce(remote)).toBe(2);
  expect(await repo.getAudit('a')).toMatchObject({ header: { auditNo: 'TEAM-1' }, createdBy: 'user-lead', activityBy: 'user-lead' });
  expect((await repo.getAnswers('a'))[0]).toMatchObject({ itemId: 'A1', result: 'no', note: 'n' });
  const newest = control.rows('hs_answers')[0].server_at!;
  expect(await repo.getSetting('sync:cursor:hs_answers', null)).toBe(cursorFrom(newest));
  expect(await repo.getSetting('sync:lastPullAt', 0)).toBeGreaterThan(0);
  expect(await db.outbox.count()).toBe(0);
});

test('second pull applies only newer rows and keeps newer pending local fields', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  const t = Date.now() + 10_000;
  control.teammate('lead', [auditCreate('a', t)]);
  await pullOnce(remote);
  await repo.setNote('a', 'A1', 'mine'); // local, not pushed
  const pending = (await db.outbox.toArray())[0].change.at;
  control.teammate('lead', [{ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'no', note: 'theirs' }, at: pending - 1 }]);
  expect(await pullOnce(remote)).toBeGreaterThanOrEqual(1);
  expect((await repo.getAnswers('a'))[0]).toMatchObject({ result: 'no', note: 'mine' });
});

test('pull refreshes members and contractors', async () => {
  const { remote, auth } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  await pullOnce(remote);
  expect((await repo.listMembers()).map((m) => m.email).sort()).toContain('lead@test');
  expect((await repo.listContractors())[0].name).toBe('AL FAHD CONTRACTING');
  expect(await repo.memberName('user-lead')).toBe('Lee Lead');
});

test('cursorFrom subtracts 60 seconds', () => {
  expect(cursorFrom('2026-11-02T10:01:00.000Z')).toBe('2026-11-02T10:00:00.000Z');
});

test('rows that share a server_at across a page boundary are all pulled', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  control.teammate('lead', [auditCreate('a', 10)]);
  // one batch: every answer gets the same server_at, as one hs_apply transaction does on the server
  control.teammate(
    'lead',
    ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'].map((item) => ({ table: 'hs_answers' as const, key: { audit_id: 'a', item_id: item }, fields: { result: 'full' }, at: 20 })),
  );
  const stamps = new Set(control.rows('hs_answers').map((r) => r.server_at));
  expect(stamps.size).toBe(1);
  expect(await pullOnce(remote, { page: 3 })).toBeGreaterThanOrEqual(8);
  expect((await repo.getAnswers('a')).map((x) => x.itemId).sort()).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']);
});

