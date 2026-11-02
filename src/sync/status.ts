/** A tiny observable value for state that lives outside the component tree (sync status, presence). */
export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(cb: (value: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subscribers = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const cb of subscribers) cb(next);
    },
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
  };
}

export type SyncStatus =
  | { kind: 'offline'; pending: number }
  | { kind: 'syncing'; pending: number }
  | { kind: 'synced'; pending: 0; at: number }
  | { kind: 'problem'; pending: number; message: string };

export const syncStatus = createStore<SyncStatus>({ kind: 'offline', pending: 0 });
