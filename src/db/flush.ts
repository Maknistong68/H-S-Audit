/**
 * Debounced writes that are guaranteed to reach the database: text fields schedule a write per key,
 * re-scheduling replaces the pending one, and page-hide/visibility events flush everything at once.
 */

type PendingWrite = { timer: ReturnType<typeof setTimeout>; write: () => Promise<void> };

const pending = new Map<string, PendingWrite>();

export const DEFAULT_WRITE_DELAY_MS = 300;

function run(write: () => Promise<void>): Promise<void> {
  return write().catch((err) => {
    console.error('pending write failed', err);
  });
}

export function schedulePendingWrite(key: string, write: () => Promise<void>, delayMs = DEFAULT_WRITE_DELAY_MS): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    void run(write);
  }, delayMs);
  pending.set(key, { timer, write });
}

export async function flushPendingWrites(): Promise<void> {
  const entries = [...pending.values()];
  pending.clear();
  for (const entry of entries) clearTimeout(entry.timer);
  await Promise.all(entries.map((entry) => run(entry.write)));
}

export function hasPendingWrites(): boolean {
  return pending.size > 0;
}

export function installFlushListeners(win: Window): void {
  const flush = () => {
    void flushPendingWrites();
  };
  win.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') flush();
  });
  win.addEventListener('pagehide', flush);
  win.addEventListener('beforeunload', flush);
}
