import { db } from '../db/db';
import { RemoteError } from '../server/errors';
import type { Remote } from '../server/remote';
import { failEntries, removeEntries } from './outbox';
import type { Change, OutboxEntry } from './types';

export interface PushResult {
  sent: number;
  left: number;
  /** Set when a batch was refused as invalid and skipped (a client bug, not data loss). */
  failed?: string;
}

/** 2 s, 4 s, 8 s … capped at 60 s. */
export function backoffMs(attempt: number): number {
  return Math.min(60_000, 2_000 * 2 ** attempt);
}

/** Consecutive patches travel together; every photo is its own batch (upload, then row). */
function batches(entries: OutboxEntry[]): OutboxEntry[][] {
  const out: OutboxEntry[][] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (e.kind === 'patch' && last && last[0].kind === 'patch') last.push(e);
    else out.push([e]);
  }
  return out;
}

/** Returns false when the photo can never be sent (its bytes are gone), so the caller drops the entry. */
async function sendPhoto(remote: Remote, entry: OutboxEntry): Promise<boolean> {
  const id = entry.change.key.id;
  const blob = await db.mediaBlobs.get(id);
  if (!blob) {
    console.warn(`photo ${id}: bytes are no longer on this device; the upload is dropped`);
    return false;
  }
  await remote.uploadPhoto(String(entry.change.fields.storage_path), blob.data);
  const uploadedAt = Date.now();
  const change: Change = { ...entry.change, fields: { ...entry.change.fields, uploaded_at: uploadedAt } };
  await remote.apply([change]);
  await db.media
    .where('id')
    .equals(id)
    .modify((m) => {
      m.uploadedAt = uploadedAt;
      m.fieldAt = { ...(m.fieldAt ?? {}), uploaded_at: entry.change.at };
    });
  return true;
}

/**
 * Drains the outbox once, oldest first. Network errors stop the run and are rethrown for the caller to back
 * off; permission and auth errors mark the entries and are rethrown; an invalid batch is marked, skipped and
 * reported so later entries still flow.
 */
export async function pushOnce(remote: Remote, opts: { batch?: number } = {}): Promise<PushResult> {
  const entries = await db.outbox.orderBy('seq').limit(opts.batch ?? 200).toArray();
  let sent = 0;
  let failed: string | undefined;
  for (const batch of batches(entries)) {
    const seqs = batch.map((e) => e.seq!);
    try {
      if (batch[0].kind === 'photo') {
        const ok = await sendPhoto(remote, batch[0]);
        await removeEntries(seqs);
        if (ok) sent += batch.length;
        continue;
      }
      await remote.apply(batch.map((e) => e.change));
      await removeEntries(seqs);
      sent += batch.length;
    } catch (err) {
      const kind = err instanceof RemoteError ? err.kind : 'unknown';
      const message = err instanceof Error ? err.message : String(err);
      if (kind === 'validation') {
        await failEntries(seqs, message);
        failed = `${kind}: ${message}`;
        continue;
      }
      if (kind === 'permission' || kind === 'auth') await failEntries(seqs, message);
      throw err;
    }
  }
  return { sent, left: await db.outbox.count(), failed };
}
