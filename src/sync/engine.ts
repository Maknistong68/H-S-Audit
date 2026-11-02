import { db } from '../db/db';
import { RemoteError } from '../server/errors';
import type { PresenceState, Remote, RemoteAuth } from '../server/remote';
import { applyIncoming, onWrite, pendingCounts } from './outbox';
import { pullOnce } from './pull';
import { backoffMs, pushOnce } from './push';
import { createStore, syncStatus, type Store } from './status';
import type { RemoteRow, SyncTable } from './types';

const PUSH_DEBOUNCE_MS = 500;
const PULL_INTERVAL_MS = 5 * 60 * 1000;

export interface Engine {
  /** Push soon (debounced); retries by itself on network errors. */
  requestPush(): void;
  pullNow(): Promise<void>;
  /** Live rows and presence for one audit; a pull runs once the channel is up. */
  openAudit(auditId: string): void;
  closeAudit(): void;
  /** Live audit-list rows while Home is open. Returns the stop function. */
  watchList(): () => void;
  setPresence(itemId: string | null): void;
  /** Everyone else in the open audit. */
  presence: Store<PresenceState[]>;
  /** Set when a teammate deletes the audit that is open here. */
  deletedAudit: Store<{ auditId: string; by: string } | null>;
  stop(): void;
}

export const engine: { current: Engine | null } = { current: null };

export function startEngine(deps: { remote: Remote; auth: RemoteAuth; win: Window }): Engine {
  const { remote, auth, win } = deps;
  const presence = createStore<PresenceState[]>([]);
  const deletedAudit = createStore<{ auditId: string; by: string } | null>(null);
  const online = () => win.navigator.onLine !== false;

  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pushing = false;
  let pushAgain = false;
  let attempt = 0;
  let stopped = false;

  let openId: string | null = null;
  let unsubscribeAudit: (() => void) | null = null;
  let myItem: string | null = null;
  let me: PresenceState | null = null;

  const pending = async () => (await pendingCounts()).total;

  async function settle(): Promise<void> {
    const n = await pending();
    if (!online()) syncStatus.set({ kind: 'offline', pending: n });
    else if (n === 0) syncStatus.set({ kind: 'synced', pending: 0, at: Date.now() });
    else syncStatus.set({ kind: 'syncing', pending: n });
  }

  function fail(err: unknown): void {
    const kind = err instanceof RemoteError ? err.kind : 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    void pending().then((n) => {
      if (kind === 'permission' || kind === 'auth' || kind === 'validation') syncStatus.set({ kind: 'problem', pending: n, message });
      else syncStatus.set({ kind: 'offline', pending: n });
    });
    if (kind === 'network' || kind === 'unknown') {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void runPush(), backoffMs(attempt++));
    }
  }

  async function runPush(): Promise<void> {
    if (stopped) return;
    if (pushing) {
      pushAgain = true;
      return;
    }
    if (!online() || !(await auth.session())) {
      syncStatus.set({ kind: 'offline', pending: await pending() });
      return;
    }
    pushing = true;
    try {
      syncStatus.set({ kind: 'syncing', pending: await pending() });
      let result = await pushOnce(remote);
      while (result.left > 0 && !result.failed && result.sent > 0) result = await pushOnce(remote);
      attempt = 0;
      if (result.failed) syncStatus.set({ kind: 'problem', pending: result.left, message: `${result.left} changes could not be sent (${result.failed})` });
      else await settle();
    } catch (err) {
      fail(err);
    } finally {
      pushing = false;
      if (pushAgain) {
        pushAgain = false;
        void runPush();
      }
    }
  }

  function requestPush(): void {
    // Be honest at once: a fresh local change means "not up to date" until the push lands.
    if (syncStatus.get().kind === 'synced') void pending().then((n) => n > 0 && syncStatus.get().kind === 'synced' && syncStatus.set({ kind: 'syncing', pending: n }));
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void runPush(), PUSH_DEBOUNCE_MS);
  }

  let pulling: Promise<void> | null = null;
  function pullNow(): Promise<void> {
    if (pulling) return pulling;
    if (!online() || stopped) return Promise.resolve();
    pulling = (async () => {
      try {
        if (!(await auth.session())) {
          syncStatus.set({ kind: 'offline', pending: await pending() });
          return;
        }
        syncStatus.set({ kind: 'syncing', pending: await pending() });
        await pullOnce(remote);
        await checkDeleted();
        if ((await pending()) > 0) requestPush();
        else await settle();
      } catch (err) {
        fail(err);
      } finally {
        pulling = null;
      }
    })();
    return pulling;
  }

  /** A teammate deleted the audit that is open here: tell the screen, whether the row came live or by pull. */
  async function checkDeleted(): Promise<void> {
    if (openId === null) return;
    const audit = await db.audits.get(openId);
    if (audit?.deletedAt !== undefined && deletedAudit.get()?.auditId !== openId) {
      deletedAudit.set({ auditId: openId, by: audit.updatedBy ?? '' });
    }
  }

  function onRow(table: SyncTable, row: RemoteRow): void {
    void applyIncoming(table, row).then(() => {
      if (table === 'hs_audits' && row.id === openId) void checkDeleted();
    });
  }

  async function identity(): Promise<PresenceState | null> {
    const session = await auth.session();
    if (!session) return null;
    const member = await db.members.get(session.userId);
    return { userId: session.userId, name: member?.fullName || session.email, itemId: myItem, at: Date.now() };
  }

  function openAudit(auditId: string): void {
    closeAudit();
    openId = auditId;
    deletedAudit.set(null);
    void identity().then((who) => {
      if (openId !== auditId) return;
      me = who;
      unsubscribeAudit = remote.subscribe(
        `audit:${auditId}`,
        {
          onRow,
          onPresence: (others) => presence.set(others),
          onStatus: (status) => {
            if (status === 'subscribed') void pullNow();
          },
        },
        me ?? undefined,
      );
    });
  }

  function closeAudit(): void {
    unsubscribeAudit?.();
    unsubscribeAudit = null;
    openId = null;
    presence.set([]);
  }

  function setPresence(itemId: string | null): void {
    myItem = itemId;
    if (openId && me) remote.track(`audit:${openId}`, { ...me, itemId, at: Date.now() });
  }

  function watchList(): () => void {
    // A pull once the channel is up closes the gap between the last pull and the first live row.
    return remote.subscribe('team:audits', {
      onRow,
      onStatus: (status) => {
        if (status === 'subscribed') void pullNow();
      },
    });
  }

  const onOnline = () => {
    attempt = 0;
    void pullNow();
    requestPush();
  };
  const onOffline = () => void pending().then((n) => syncStatus.set({ kind: 'offline', pending: n }));
  const onVisible = () => {
    if (win.document.visibilityState === 'visible') onOnline();
  };
  win.addEventListener('online', onOnline);
  win.addEventListener('offline', onOffline);
  win.document.addEventListener('visibilitychange', onVisible);
  const offWrite = onWrite(requestPush);
  const offAuth = auth.onChange((session) => {
    // Deferred: supabase-js must not be called from inside its own auth callback.
    if (session) setTimeout(onOnline, 0);
  });
  const interval = setInterval(() => {
    if (win.document.visibilityState === 'visible') void pullNow();
  }, PULL_INTERVAL_MS);

  onOnline();

  const api: Engine = {
    requestPush,
    pullNow,
    openAudit,
    closeAudit,
    watchList,
    setPresence,
    presence,
    deletedAudit,
    stop() {
      stopped = true;
      if (pushTimer) clearTimeout(pushTimer);
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(interval);
      win.removeEventListener('online', onOnline);
      win.removeEventListener('offline', onOffline);
      win.document.removeEventListener('visibilitychange', onVisible);
      offWrite();
      offAuth();
      closeAudit();
      if (engine.current === api) engine.current = null;
    },
  };
  engine.current = api;
  return api;
}
