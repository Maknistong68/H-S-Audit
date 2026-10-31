import { test, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { takeSnapshot, listSnapshots, restoreSnapshot, startSnapshotTimer, SNAPSHOT_LIMIT } from '../../src/db/snapshots';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('take, list, prune', async () => {
  const a = await repo.createAudit();
  await repo.setResult(a.id, 'A1', 'no');
  for (let i = 0; i < SNAPSHOT_LIMIT + 3; i++) await takeSnapshot(a.id, 'manual');
  const list = await listSnapshots(a.id);
  expect(list.length).toBe(SNAPSHOT_LIMIT);
  expect(list[0].createdAt).toBeGreaterThanOrEqual(list.at(-1)!.createdAt);
  expect(JSON.parse(list[0].payload).answers[0]).toMatchObject({ itemId: 'A1', result: 'no' });
});

test('restore replaces answers and relinks media, after a safety snapshot', async () => {
  const a = await repo.createAudit({ auditNo: 'X' });
  await repo.setResult(a.id, 'A1', 'full');
  const m = await repo.addMedia({
    auditId: a.id,
    owner: { kind: 'item', itemId: 'A1' },
    type: 'photo',
    data: new ArrayBuffer(2),
    mime: 'image/jpeg',
  });
  const snap = await takeSnapshot(a.id, 'manual');
  await repo.setResult(a.id, 'A1', 'no');
  await repo.setResult(a.id, 'A2', 'partial');
  await repo.softDeleteMedia(m.id);
  await repo.updateHeader(a.id, { auditNo: 'Y' });
  await restoreSnapshot(snap.id);
  const ans = await repo.getAnswers(a.id);
  expect(ans.find((x) => x.itemId === 'A1')!.result).toBe('full');
  expect(ans.find((x) => x.itemId === 'A2')).toBeUndefined();
  expect((await repo.listMedia(a.id)).length).toBe(1);
  expect((await repo.getAudit(a.id))!.header.auditNo).toBe('X');
  expect((await listSnapshots(a.id)).map((s) => s.reason)).toEqual(['before-restore', 'manual']);
});

test('timer snapshots only when dirty', async () => {
  // Only the interval and the clock are faked: fake-indexeddb needs real setTimeout/setImmediate to run.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const settle = () => new Promise((r) => setTimeout(r, 30)); // let the tick's DB work finish
  try {
    const a = await repo.createAudit();
    const stop = startSnapshotTimer(a.id, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect((await listSnapshots(a.id)).length).toBe(0);
    await repo.setResult(a.id, 'A1', 'no');
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect((await listSnapshots(a.id)).length).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect((await listSnapshots(a.id)).length).toBe(1);
    stop();
  } finally {
    vi.useRealTimers();
  }
});
