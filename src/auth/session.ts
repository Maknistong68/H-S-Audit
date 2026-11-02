import { db, type Member } from '../db/db';
import type { RemoteAuth, Session } from '../server/remote';
import { createStore } from '../sync/status';
import { setWriter } from '../sync/writer';

export type SessionState = { status: 'loading' } | { status: 'signed-out' } | { status: 'no-role'; email: string } | { status: 'ready'; me: Member };

export const sessionStore = createStore<SessionState>({ status: 'loading' });

const ME_KEY = 'auth:me';

async function resolve(auth: RemoteAuth, session: Session | null): Promise<SessionState> {
  if (!session) {
    setWriter(null);
    return { status: 'signed-out' };
  }
  let me: Member | null = null;
  try {
    me = await auth.me();
    if (me) await db.settings.put({ key: ME_KEY, value: me });
  } catch {
    // Offline: the profile cached at the last sign-in is enough to open the app and work.
    const cached = (await db.settings.get(ME_KEY))?.value as Member | undefined;
    if (cached && cached.id === session.userId) me = cached;
  }
  if (!me || !me.role || !me.confirmed) {
    setWriter(null);
    return { status: 'no-role', email: session.email };
  }
  setWriter({ id: me.id, role: me.role });
  return { status: 'ready', me };
}

let current: RemoteAuth | null = null;

/** Resolves the stored session into app state and keeps it current as the auth state changes. */
export async function startSession(auth: RemoteAuth): Promise<void> {
  current = auth;
  sessionStore.set(await resolve(auth, await auth.session()));
  auth.onChange((session) => {
    // Deferred: supabase-js must not be called from inside its own auth callback.
    setTimeout(() => void resolve(auth, session).then((state) => sessionStore.set(state)), 0);
  });
}

/** Re-reads the profile (after a name change, or when an admin changed the role). */
export async function refreshSession(): Promise<void> {
  if (!current) return;
  sessionStore.set(await resolve(current, await current.session()));
}
