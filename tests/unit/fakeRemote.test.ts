import { test, expect } from 'vitest';
import { RemoteError } from '../../src/server/errors';
import { createFake } from '../../src/server/fakeRemote';
import type { RemoteRow, SyncTable } from '../../src/sync/types';

const auditCreate = (id: string, at: number) => ({ table: 'hs_audits' as const, key: { id }, fields: { audit_no: 'X', status: 'draft', template_version: 't', created_at: 1 }, at });

test('apply then pull returns rows in server_at order and respects field timestamps', async () => {
  const { remote, auth } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  const me = (await auth.session())!.userId;
  expect(await remote.apply([auditCreate('a', 10)])).toEqual({ applied: 4, skipped: 0 });
  expect(await remote.apply([{ table: 'hs_audits', key: { id: 'a' }, fields: { audit_no: 'OLD' }, at: 5 }])).toEqual({ applied: 0, skipped: 1 });
  await remote.apply([auditCreate('b', 11)]);
  const rows = await remote.pull('hs_audits', null, 100);
  expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  expect(rows[0]).toMatchObject({ audit_no: 'X', updated_by: me, created_by: me, updated_at: 10 });
  expect(rows[0].server_at! < rows[1].server_at!).toBe(true);
  expect(await remote.pull('hs_audits', rows[0].server_at!, 100)).toEqual([rows[1]]);
  expect(await remote.pull('hs_audits', rows[1].server_at!, 100)).toEqual([]);
  expect(await remote.pull('hs_audits', null, 1)).toHaveLength(1);
});

test('viewers cannot apply; signed-out callers get an auth error', async () => {
  const { remote, auth } = createFake();
  await expect(remote.apply([auditCreate('a', 1)])).rejects.toMatchObject({ kind: 'auth' });
  await auth.signIn('viewer@test', 'test1234');
  await expect(remote.apply([auditCreate('a', 1)])).rejects.toMatchObject({ kind: 'permission' });
  expect(await remote.pull('hs_audits', null, 10)).toEqual([]); // viewers can read
  await auth.signOut();
  await auth.signIn('auditor@test', 'test1234');
  await expect(remote.apply([{ table: 'nope' as SyncTable, key: { id: 'x' }, fields: {}, at: 1 }])).rejects.toMatchObject({ kind: 'validation' }); // hs_apply raises for an unknown table
});

test('a wrong password is an auth error with the Supabase message; an unknown field is a validation error', async () => {
  const { remote, auth } = createFake();
  await expect(auth.signIn('auditor@test', 'nope')).rejects.toMatchObject({ kind: 'auth', message: 'Invalid login credentials' });
  await auth.signIn('auditor@test', 'test1234');
  await expect(remote.apply([{ table: 'hs_audits', key: { id: 'a' }, fields: { nope: 1 }, at: 1 }])).rejects.toMatchObject({ kind: 'validation' });
});

test('offline rejects with a network error and comes back', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  control.setOnline(false);
  await expect(remote.apply([auditCreate('a', 1)])).rejects.toBeInstanceOf(RemoteError);
  await expect(remote.pull('hs_audits', null, 10)).rejects.toMatchObject({ kind: 'network' });
  control.setOnline(true);
  await remote.apply([auditCreate('a', 1)]);
  expect(await remote.pull('hs_audits', null, 10)).toHaveLength(1);
});

test('photos upload once, a duplicate upload is fine, and download returns the bytes', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  await remote.uploadPhoto('a/m1.jpg', bytes);
  await remote.uploadPhoto('a/m1.jpg', bytes);
  expect(control.uploaded()).toEqual(['a/m1.jpg']);
  expect(new Uint8Array(await remote.downloadPhoto('a/m1.jpg'))).toEqual(new Uint8Array([1, 2, 3]));
  await expect(remote.downloadPhoto('a/none.jpg')).rejects.toMatchObject({ kind: 'validation' });
  control.putPhoto('a/m2.jpg', bytes);
  expect(new Uint8Array(await remote.downloadPhoto('a/m2.jpg'))).toEqual(new Uint8Array([1, 2, 3]));
});

test('subscribe delivers teammate changes for the audit topic and the team topic', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  const seen: { topic: string; table: SyncTable; row: RemoteRow }[] = [];
  const statuses: string[] = [];
  const offA = remote.subscribe('audit:a', { onRow: (table, row) => seen.push({ topic: 'audit:a', table, row }), onStatus: (s) => statuses.push(s) });
  const offTeam = remote.subscribe('team:audits', { onRow: (table, row) => seen.push({ topic: 'team:audits', table, row }), onStatus: () => undefined });
  expect(statuses).toEqual(['subscribed']);
  control.teammate('lead', [auditCreate('a', 10), { table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'full' }, at: 11 }]);
  control.teammate('lead', [auditCreate('b', 12)]);
  expect(seen.map((s) => `${s.topic}/${s.table}/${s.row.id ?? s.row.item_id}`)).toEqual(['audit:a/hs_audits/a', 'team:audits/hs_audits/a', 'audit:a/hs_answers/A1', 'team:audits/hs_audits/b']);
  expect(seen[0].row.updated_by).toBe(control.userId('lead@test'));
  offA();
  offTeam();
  control.teammate('lead', [{ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A2' }, fields: { result: 'no' }, at: 13 }]);
  expect(seen).toHaveLength(4);
});

test('presence is shared between subscribers of one audit, excluding yourself', async () => {
  const { remote, auth } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  const me = (await auth.session())!.userId;
  const others: string[][] = [];
  remote.subscribe('audit:a', { onRow: () => undefined, onStatus: () => undefined, onPresence: (list) => others.push(list.map((p) => p.name)) }, { userId: me, name: 'Ola Auditor', itemId: null, at: 1 });
  remote.track('audit:a', { userId: 'lead', name: 'Lee Lead', itemId: 'B1.1', at: 2 });
  expect(others.at(-1)).toEqual(['Lee Lead']);
});

test('directory and contractors come from the fake team; invite returns exists or invited and the new user can accept', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('admin@test', 'test1234');
  const dir = await remote.directory();
  expect(dir.map((m) => m.email).sort()).toEqual(['admin@test', 'auditor@test', 'invited@test', 'lead@test', 'viewer@test']);
  expect(dir.find((m) => m.email === 'invited@test')).toMatchObject({ role: null, confirmed: false });
  expect((await remote.contractors())[0]).toMatchObject({ id: '4800001322', name: expect.any(String) });
  expect(await auth.invite('auditor@test', 'auditor')).toBe('exists');
  expect(await auth.invite('new@test', 'lead')).toBe('invited');
  expect((await auth.listInvites()).map((i) => i.email)).toContain('new@test');
  control.acceptInvite('new@test', 'secret99', 'New Person');
  await auth.signOut();
  await auth.signIn('new@test', 'secret99');
  expect(await auth.me()).toMatchObject({ email: 'new@test', fullName: 'New Person', role: 'lead', confirmed: true });
  const newId = (await auth.me())!.id;
  await expect(auth.setRole(newId, 'viewer')).rejects.toMatchObject({ kind: 'permission' }); // leads do not manage roles
  await auth.signOut();
  await auth.signIn('admin@test', 'test1234');
  await auth.setRole(newId, 'viewer');
  expect((await remote.directory()).find((m) => m.id === newId)!.role).toBe('viewer');
});

test('a pre-signed fake session is read from localStorage', async () => {
  const store = new Map<string, string>([['hs:fakeSession', 'lead@test']]);
  const { auth } = createFake({ storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) } });
  expect(await auth.session()).toMatchObject({ email: 'lead@test' });
  expect((await auth.me())!.role).toBe('lead');
});
