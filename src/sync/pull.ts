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

/** Fetches everything changed since the last pull, merges it, and refreshes the team directory. Returns rows applied. */
export async function pullOnce(remote: Remote): Promise<number> {
  let applied = 0;
  for (const table of TABLES) {
    let cursor = await setting<string | null>(cursorKey(table), null);
    let newest: string | null = null;
    for (;;) {
      const rows = await remote.pull(table, cursor, PAGE);
      for (const row of rows) {
        await applyIncoming(table, row);
        applied += 1;
        if (row.server_at && (!newest || row.server_at > newest)) newest = row.server_at;
      }
      if (rows.length < PAGE) break;
      cursor = rows[rows.length - 1].server_at ?? cursor;
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
