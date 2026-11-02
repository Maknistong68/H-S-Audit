import { test, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/db';
import { repo } from '../../src/db/repo';
import { createFake } from '../../src/server/fakeRemote';
import { ensurePhoto, ensurePhotos } from '../../src/sync/photos';
import { setWriter } from '../../src/sync/writer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWriter({ id: 'user-auditor', role: 'auditor' });
});

async function teammatePhoto(auditId: string, id: string, uploaded: boolean) {
  await db.media.put({ id, auditId, owner: { kind: 'item', itemId: 'A1' }, type: 'photo', mime: 'image/jpeg', bytes: 3, createdAt: 1, storagePath: `${auditId}/${id}.jpg`, uploadedAt: uploaded ? 2 : undefined, thumb: new Uint8Array([7]).buffer });
}

test('ensurePhoto downloads a missing blob once and is a no-op when present', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  const a = await repo.createAudit();
  await teammatePhoto(a.id, 'm1', true);
  control.putPhoto(`${a.id}/m1.jpg`, new Uint8Array([1, 2, 3]).buffer);
  const spy = vi.spyOn(remote, 'downloadPhoto');
  expect(await ensurePhoto(remote, 'm1')).toBe(true);
  expect(await ensurePhoto(remote, 'm1')).toBe(true);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(new Uint8Array((await repo.getMedia('m1'))!.data)).toEqual(new Uint8Array([1, 2, 3]));
  expect((await repo.getMedia('m1'))!.fromThumb).toBeUndefined();
});

test('ensurePhotos reports photos that are not uploaded yet or unreachable as missing, with progress', async () => {
  const { remote, auth, control } = createFake();
  await auth.signIn('auditor@test', 'test1234');
  const a = await repo.createAudit();
  await teammatePhoto(a.id, 'm1', true);
  await teammatePhoto(a.id, 'm2', false);
  await teammatePhoto(a.id, 'm3', true); // uploaded, but the file is not there
  control.putPhoto(`${a.id}/m1.jpg`, new Uint8Array([1]).buffer);
  const progress: [number, number][] = [];
  const result = await ensurePhotos(remote, a.id, (done, total) => progress.push([done, total]));
  expect(result.missing.sort()).toEqual(['m2', 'm3']);
  expect(progress).toEqual([
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  control.setOnline(false);
  expect((await ensurePhotos(remote, a.id)).missing.sort()).toEqual(['m2', 'm3']); // offline: no throw, just missing
});
