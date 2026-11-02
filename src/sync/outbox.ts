import { db, type Answer, type Audit, type MediaRow, type Positive } from '../db/db';
import { answerId } from '../db/ids';
import { photoStoragePath, photoToRemote, rowKey, toLocal, toRemote } from '../server/rows';
import { applyChange, mergeRows, nextAt } from './merge';
import type { Change, OutboxEntry, RemoteRow, SyncTable } from './types';
import { canEdit, getWriter, ReadOnlyError } from './writer';

type LocalRow = Audit | Answer | Positive | MediaRow;

const SYNC_COLUMNS = ['updated_at', 'updated_by', 'field_at', 'server_at', 'created_by'];

function tableOf(table: SyncTable) {
  switch (table) {
    case 'hs_audits':
      return db.audits;
    case 'hs_answers':
      return db.answers;
    case 'hs_positives':
      return db.positives;
    case 'hs_photos':
      return db.media;
  }
}

const localId = (table: SyncTable, key: Record<string, string>): string => (table === 'hs_answers' ? answerId(key.audit_id, key.item_id) : key.id);

function keyFromRow(table: SyncTable, row: RemoteRow): Record<string, string> {
  return table === 'hs_answers' ? { audit_id: String(row.audit_id), item_id: String(row.item_id) } : { id: String(row.id) };
}

function auditIdOf(table: SyncTable, key: Record<string, string>, row: RemoteRow): string {
  return table === 'hs_audits' ? key.id : String(row.audit_id ?? key.audit_id);
}

const listeners = new Set<() => void>();

/** Called after every local write that queued something; the sync engine listens to push soon after. */
export function onWrite(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) cb();
}

function writerOrThrow(): { id: string } {
  const writer = getWriter();
  if (writer && !canEdit(writer.role)) throw new ReadOnlyError();
  return { id: writer?.id ?? 'local' };
}

async function bumpActivity(auditId: string, at: number, by: string): Promise<void> {
  await db.audits
    .where('id')
    .equals(auditId)
    .modify((a) => {
      if ((a.activityAt ?? 0) <= at) {
        a.activityAt = at;
        a.activityBy = by;
      }
    });
}

export type Fields = Record<string, unknown> | ((current: RemoteRow | undefined) => Record<string, unknown>);

/**
 * The one local write path: applies a field patch to the local row and queues the same patch for the server,
 * in one transaction, so the two can never disagree. `at` is normally derived (see nextAt).
 */
export async function writeChange(input: { table: SyncTable; key: Record<string, string>; fields: Fields; at?: number }): Promise<void> {
  const by = writerOrThrow().id;
  const table = tableOf(input.table);
  await db.transaction('rw', [table, db.outbox, db.audits], async () => {
    const current = (await table.get(localId(input.table, input.key))) as LocalRow | undefined;
    const remoteCurrent = current ? toRemote(input.table, current) : undefined;
    const fields = typeof input.fields === 'function' ? input.fields(remoteCurrent) : input.fields;
    const at = input.at ?? nextAt(Date.now(), remoteCurrent, Object.keys(fields));
    const change: Change = { table: input.table, key: input.key, fields, at };
    const { row } = applyChange(remoteCurrent, change, by);
    if (!current && input.table !== 'hs_answers') row.created_by = by;
    await table.put(toLocal(input.table, row, current) as never);
    const auditId = auditIdOf(input.table, input.key, row);
    const entry: OutboxEntry = { kind: 'patch', table: input.table, key: rowKey(input.table, input.key), auditId, change, attempts: 0 };
    await db.outbox.add(entry);
    await bumpActivity(auditId, at, by);
  });
  notify();
}

/** A new photo: bytes and metadata locally, plus a queued upload followed by its row. */
export async function writePhoto(row: MediaRow, data: ArrayBuffer): Promise<void> {
  const by = writerOrThrow().id;
  const at = Math.max(Date.now(), row.createdAt);
  const remote = photoToRemote({ ...row, createdBy: by, storagePath: photoStoragePath(row.auditId, row.id), uploadedAt: undefined, updatedAt: at, updatedBy: by });
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(remote)) if (k !== 'id' && !SYNC_COLUMNS.includes(k)) fields[k] = v;
  const change: Change = { table: 'hs_photos', key: { id: row.id }, fields, at };
  const local = toLocal('hs_photos', applyChange(undefined, change, by).row, undefined) as MediaRow;
  local.createdBy = by;
  if (row.thumb) local.thumb = row.thumb;
  await db.transaction('rw', [db.media, db.mediaBlobs, db.outbox, db.audits], async () => {
    await db.mediaBlobs.put({ id: row.id, data });
    await db.media.put(local);
    await db.outbox.add({ kind: 'photo', table: 'hs_photos', key: rowKey('hs_photos', { id: row.id }), auditId: row.auditId, change, attempts: 0 });
    await bumpActivity(row.auditId, at, by);
  });
  notify();
}

/** Pending patches for one row, oldest first. */
export async function pendingFor(key: string): Promise<Change[]> {
  const entries = await db.outbox.where('key').equals(key).sortBy('seq');
  return entries.map((e) => e.change);
}

export async function pendingCounts(): Promise<{ total: number; byAudit: Map<string, number> }> {
  const byAudit = new Map<string, number>();
  let total = 0;
  await db.outbox.each((e) => {
    total += 1;
    byAudit.set(e.auditId, (byAudit.get(e.auditId) ?? 0) + 1);
  });
  return { total, byAudit };
}

/** A row from the server (pull or live): merged under any newer local patches that are still queued. */
export async function applyIncoming(table: SyncTable, row: RemoteRow): Promise<void> {
  const store = tableOf(table);
  const key = keyFromRow(table, row);
  await db.transaction('rw', [store, db.outbox, db.audits], async () => {
    const current = (await store.get(localId(table, key))) as LocalRow | undefined;
    const pending = await pendingFor(rowKey(table, key));
    const merged = mergeRows(current ? toRemote(table, current) : undefined, row, pending);
    await store.put(toLocal(table, merged, current) as never);
    if (typeof row.updated_at === 'number' && typeof row.updated_by === 'string') {
      await bumpActivity(auditIdOf(table, key, row), row.updated_at, row.updated_by);
    }
  });
}

export async function removeEntries(seqs: number[]): Promise<void> {
  await db.outbox.bulkDelete(seqs);
}

export async function failEntries(seqs: number[], error: string): Promise<void> {
  await db.outbox
    .where('seq')
    .anyOf(seqs)
    .modify((e) => {
      e.attempts += 1;
      e.lastError = error;
    });
}
