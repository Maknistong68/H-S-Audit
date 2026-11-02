import { test, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { createFake } from '../../src/server/fakeRemote';
import { startEngine, type Engine } from '../../src/sync/engine';
import { syncStatus } from '../../src/sync/status';
import { setWriter } from '../../src/sync/writer';

/** Enough of a window for the engine: events, visibility and navigator.onLine. */
function fakeWindow() {
  const target = new EventTarget();
  const nav = { onLine: true };
  const doc = { visibilityState: 'visible' as 'visible' | 'hidden', addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) };
  return {
    win: { addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), navigator: nav, document: doc, setInterval, clearInterval } as unknown as Window,
    goOffline: () => {
      nav.onLine = false;
      target.dispatchEvent(new Event('offline'));
    },
    goOnline: () => {
      nav.onLine = true;
      target.dispatchEvent(new Event('online'));
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 700)); // past the 500 ms push debounce

let engine: Engine | null = null;

beforeEach(async () => {
  engine?.stop();
  engine = null;
  await db.delete();
  await db.open();
  setWriter({ id: 'user-auditor', role: 'auditor' });
});

async function start() {
  const fake = createFake();
  await fake.auth.signIn('auditor@test', 'test1234');
  const w = fakeWindow();
  engine = startEngine({ remote: fake.remote, auth: fake.auth, win: w.win });
  return { ...fake, ...w, engine };
}

test('a local write leads to a push and the status ends synced', async () => {
  const { control } = await start();
  await repo.createAudit({ auditNo: 'E1' });
  await settle();
  expect(control.rows('hs_audits')[0]).toMatchObject({ audit_no: 'E1' });
  expect(syncStatus.get()).toMatchObject({ kind: 'synced', pending: 0 });
});

test('going offline sets offline and coming back pushes and pulls', async () => {
  const { control, goOffline, goOnline } = await start();
  await settle();
  goOffline();
  control.setOnline(false);
  await repo.createAudit({ auditNo: 'E2' });
  await settle();
  expect(syncStatus.get()).toMatchObject({ kind: 'offline', pending: 1 });
  expect(control.rows('hs_audits')).toHaveLength(0);
  control.teammate('lead', [{ table: 'hs_audits', key: { id: 'remote-1' }, fields: { audit_no: 'FROM-LEAD', status: 'draft', template_version: 't', created_at: 1 }, at: Date.now() + 5000 }]);
  control.setOnline(true);
  goOnline();
  await settle();
  expect(control.rows('hs_audits').map((r) => r.audit_no).sort()).toEqual(['E2', 'FROM-LEAD']);
  expect((await repo.getAudit('remote-1'))?.header.auditNo).toBe('FROM-LEAD');
  expect(syncStatus.get()).toMatchObject({ kind: 'synced' });
});

test('openAudit receives a teammate change live and setPresence is tracked', async () => {
  const { control, engine, remote } = await start();
  const a = await repo.createAudit({ auditNo: 'E3' });
  await settle();
  engine.openAudit(a.id);
  await settle();
  control.teammate('lead', [{ table: 'hs_answers', key: { audit_id: a.id, item_id: 'B1.1' }, fields: { result: 'partial' }, at: Date.now() + 5000 }]);
  await new Promise((r) => setTimeout(r, 50));
  expect((await repo.getAnswers(a.id)).find((x) => x.itemId === 'B1.1')).toMatchObject({ result: 'partial', updatedBy: 'user-lead' });
  engine.setPresence('A2');
  remote.track(`audit:${a.id}`, { userId: 'user-lead', name: 'Lee Lead', itemId: 'B1.1', at: 1 });
  expect(engine.presence.get()).toEqual([{ userId: 'user-lead', name: 'Lee Lead', itemId: 'B1.1', at: 1 }]);
  engine.closeAudit();
  expect(engine.presence.get()).toEqual([]);
});

test('an incoming deleted_at on the open audit sets deletedAudit', async () => {
  const { control, engine } = await start();
  const a = await repo.createAudit({ auditNo: 'E4' });
  await settle();
  engine.openAudit(a.id);
  await settle(); // the channel is up
  control.teammate('lead', [{ table: 'hs_audits', key: { id: a.id }, fields: { deleted_at: Date.now() + 5000 }, at: Date.now() + 5000 }]);
  await new Promise((r) => setTimeout(r, 50));
  expect(engine.deletedAudit.get()).toEqual({ auditId: a.id, by: 'user-lead' });
  // and the same when the deletion happened while this phone was away from the channel
  engine.closeAudit();
  const b = await repo.createAudit({ auditNo: 'E4b' });
  await settle();
  control.teammate('lead', [{ table: 'hs_audits', key: { id: b.id }, fields: { deleted_at: Date.now() + 6000 }, at: Date.now() + 6000 }]);
  engine.openAudit(b.id);
  await settle();
  expect(engine.deletedAudit.get()).toEqual({ auditId: b.id, by: 'user-lead' });
});

test('a permission failure shows as a problem and recovers when pushing works again', async () => {
  const { control } = await start();
  control.setRole('user-auditor', 'viewer');
  await repo.createAudit({ auditNo: 'E5' });
  await settle();
  expect(syncStatus.get()).toMatchObject({ kind: 'problem', pending: 1 });
  control.setRole('user-auditor', 'auditor');
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  // nothing to do here with fake timers; the retry path is driven by the next write or reconnect
  vi.useRealTimers();
  await repo.setNote((await repo.listAudits())[0].id, 'A1', 'x');
  await settle();
  expect(syncStatus.get()).toMatchObject({ kind: 'synced' });
});
