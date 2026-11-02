import { test, expect, beforeEach } from 'vitest';
import { sessionStore, startSession } from '../../src/auth/session';
import { db, type Member } from '../../src/db/db';
import type { RemoteAuth, Session } from '../../src/server/remote';
import { getWriter } from '../../src/sync/writer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  sessionStore.set({ status: 'loading' });
});

const me: Member = { id: 'u1', email: 'ola@test', fullName: 'Ola Auditor', role: 'auditor', confirmed: true };

/** A RemoteAuth whose profile fetch takes as long as we say (a phone with one bar of signal). */
function slowAuth(session: Session | null, profile: Member | null, delayMs: number): RemoteAuth & { calls: number } {
  const auth = {
    calls: 0,
    session: async () => session,
    onChange: () => () => undefined,
    me: async () => {
      auth.calls += 1;
      await new Promise((r) => setTimeout(r, delayMs));
      return profile;
    },
  } as unknown as RemoteAuth & { calls: number };
  return auth;
}

test('with a cached profile the app is ready at once; the slow refresh lands later', async () => {
  await db.settings.put({ key: 'auth:me', value: me });
  const auth = slowAuth({ userId: 'u1', email: 'ola@test' }, { ...me, fullName: 'Ola Renamed' }, 300);
  const started = Date.now();
  await startSession(auth);
  expect(Date.now() - started).toBeLessThan(200);
  expect(sessionStore.get()).toEqual({ status: 'ready', me });
  expect(getWriter()).toEqual({ id: 'u1', role: 'auditor' });
  await new Promise((r) => setTimeout(r, 400));
  expect(sessionStore.get()).toMatchObject({ status: 'ready', me: { fullName: 'Ola Renamed' } });
  expect(auth.calls).toBe(1);
});

test('without a cached profile the app waits for the profile', async () => {
  const auth = slowAuth({ userId: 'u1', email: 'ola@test' }, me, 50);
  await startSession(auth);
  expect(sessionStore.get()).toEqual({ status: 'ready', me });
  expect((await db.settings.get('auth:me'))?.value).toEqual(me);
});

test('a cached profile for another account is ignored', async () => {
  await db.settings.put({ key: 'auth:me', value: { ...me, id: 'someone-else' } });
  const auth = slowAuth({ userId: 'u1', email: 'ola@test' }, null, 10);
  await startSession(auth);
  expect(sessionStore.get()).toEqual({ status: 'no-role', email: 'ola@test' });
});

test('no session means signed out, without touching the network', async () => {
  const auth = slowAuth(null, me, 10);
  await startSession(auth);
  expect(sessionStore.get()).toEqual({ status: 'signed-out' });
  expect(auth.calls).toBe(0);
  expect(getWriter()).toBeNull();
});
