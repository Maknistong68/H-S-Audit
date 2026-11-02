import { db } from '../db/db';
import type { Remote } from '../server/remote';
import { applyIncoming } from './outbox';
import type { SyncTable } from './types';

const TABLES: SyncTable[] = ['hs_audits', 'hs_answers', 'hs_positives', 'hs_photos'];
const PAGE = 1000;
const CURSOR_MARGIN_MS = 60_000;

export const cursorKey = (table: SyncTable) => `sync:cursor:${table}`;

/** Rows commit later than their server_at; a 60 s margin plus idempotent merges means nothing is missed. */
export function cursorFrom(newestServerAt: string): string {
  return new Date(Date.parse(newestServerAt) - CURSOR_MARGIN_MS).toISOString();
}

async function setting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

/**
 * Fetches everything changed since the last pull, merges it, and refreshes the team directory. Returns rows applied.
 * Rows written in one server transaction share a server_at, so a page that ends inside such a group continues
 * with an inclusive request from that stamp (re-merging a few rows is harmless; skipping them would lose data).
 */
export async function pullOnce(remote: Remote, opts: { page?: number } = {}): Promise<number> {
  const page = opts.page ?? PAGE;
  let applied = 0;
  for (const table of TABLES) {
    let cursor = await setting<string | null>(cursorKey(table), null);
    let inclusive = false;
    let limit = page;
    let newest: string | null = null;
    for (;;) {
      const rows = await remote.pull(table, cursor, limit, { inclusive });
      for (const row of rows) {
        await applyIncoming(table, row);
        applied += 1;
        if (row.server_at && (!newest || row.server_at > newest)) newest = row.server_at;
      }
      if (rows.length < limit) break;
      const first = rows[0].server_at ?? null;
      const last = rows[rows.length - 1].server_at ?? null;
      if (last === null) break;
      if (inclusive && first === last && cursor === last) {
        limit *= 2; // the group sharing this stamp is larger than the page: fetch it whole
        continue;
      }
      inclusive = true;
      cursor = last;
      limit = page;
    }
    if (newest) await db.settings.put({ key: cursorKey(table), value: cursorFrom(newest) });
  }
  const [members, contractors] = await Promise.all([remote.directory(), remote.contractors()]);
  await db.transaction('rw', [db.members, db.contractors, db.settings], async () => {
    await db.members.clear();
    await db.members.bulkPut(members);
    await db.contractors.clear();
    await db.contractors.bulkPut(contractors);
    await db.settings.put({ key: 'sync:lastPullAt', value: Date.now() });
  });
  return applied;
}
