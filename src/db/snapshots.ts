import { db, type Answer, type Audit, type MediaRow, type Positive, type Snapshot, type SnapshotReason } from './db';
import { newId } from './ids';
import { writeChange } from '../sync/outbox';

export const SNAPSHOT_LIMIT = 40;
export const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

export type { SnapshotReason };

export type MediaMeta = Omit<MediaRow, 'thumb'>;

export interface SnapshotPayload {
  formatVersion: 1;
  audit: Audit;
  answers: Answer[];
  positives: Positive[];
  media: MediaMeta[];
}

function stripMedia(m: MediaRow): MediaMeta {
  const { thumb: _thumb, ...meta } = m;
  return meta;
}

/** Everything about an audit except media bytes (which live in their own table and are never read here). */
export async function buildSnapshotPayload(auditId: string): Promise<SnapshotPayload> {
  const audit = await db.audits.get(auditId);
  if (!audit) throw new Error('audit not found');
  const [answers, positives, media] = await Promise.all([
    db.answers.where('auditId').equals(auditId).toArray(),
    db.positives.where('auditId').equals(auditId).toArray(),
    db.media.where('auditId').equals(auditId).toArray(),
  ]);
  return { formatVersion: 1, audit, answers, positives, media: media.map(stripMedia) };
}

export async function takeSnapshot(auditId: string, reason: SnapshotReason): Promise<Snapshot> {
  return db.transaction('rw', [db.audits, db.answers, db.positives, db.media, db.snapshots], async () => {
    const payload = await buildSnapshotPayload(auditId);
    const existing = await db.snapshots.where('auditId').equals(auditId).toArray();
    const newest = existing.reduce((max, s) => Math.max(max, s.createdAt), 0);
    const snapshot: Snapshot = {
      id: newId(),
      auditId,
      // strictly increasing so ordering is deterministic even within one millisecond
      createdAt: Math.max(Date.now(), newest + 1),
      reason,
      payload: JSON.stringify(payload),
    };
    await db.snapshots.add(snapshot);
    const surplus = existing.sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, existing.length + 1 - SNAPSHOT_LIMIT));
    if (surplus.length) await db.snapshots.bulkDelete(surplus.map((s) => s.id));
    return snapshot;
  });
}

/** Newest first. */
export async function listSnapshots(auditId: string): Promise<Snapshot[]> {
  const all = await db.snapshots.where('auditId').equals(auditId).toArray();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Puts the audit back the way the snapshot has it, as ordinary edits: every difference becomes a patch that
 * syncs like any other change. Rows are never deleted; an answer that did not exist is cleared instead.
 */
export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const snapshot = await db.snapshots.get(snapshotId);
  if (!snapshot) throw new Error('snapshot not found');
  const payload = JSON.parse(snapshot.payload) as SnapshotPayload;
  const auditId = snapshot.auditId;
  const current = await db.audits.get(auditId);
  if (!current) throw new Error('audit not found');
  await takeSnapshot(auditId, 'before-restore');

  const header = payload.audit.header;
  await writeChange({
    table: 'hs_audits',
    key: { id: auditId },
    fields: {
      audit_no: header.auditNo,
      contractor_wo: header.contractorWo,
      project_name: header.projectName,
      auditors: header.auditors,
      audit_date: header.auditDate || null,
      contact_number: header.contactNumber,
      status: payload.audit.status,
    },
  });

  const wanted = new Map(payload.answers.map((a) => [a.itemId, a]));
  for (const a of await db.answers.where('auditId').equals(auditId).toArray()) {
    if (!wanted.has(a.itemId)) wanted.set(a.itemId, { ...a, result: undefined, note: '', flagged: false, repeated: false });
  }
  for (const a of wanted.values()) {
    await writeChange({ table: 'hs_answers', key: { audit_id: auditId, item_id: a.itemId }, fields: { result: a.result ?? null, note: a.note ?? '', flagged: !!a.flagged, repeated: !!a.repeated } });
  }

  const positives = new Map(payload.positives.map((p) => [p.id, p]));
  for (const p of await db.positives.where('auditId').equals(auditId).toArray()) {
    const target = positives.get(p.id);
    const fields = target ? { text: target.text, position: target.order, deleted_at: target.deletedAt ?? null } : { deleted_at: Date.now() };
    await writeChange({ table: 'hs_positives', key: { id: p.id }, fields });
  }

  for (const meta of payload.media) {
    const row = await db.media.get(meta.id);
    if (!row) continue; // purged; nothing to relink
    if (row.type === 'photo') await writeChange({ table: 'hs_photos', key: { id: meta.id }, fields: { deleted_at: meta.deletedAt ?? null } });
    else await db.media.update(meta.id, { deletedAt: meta.deletedAt });
  }
}

/** Takes a snapshot only if the audit changed since the newest one (or since it was created). */
export async function snapshotIfDirty(auditId: string, reason: SnapshotReason): Promise<Snapshot | null> {
  const audit = await db.audits.get(auditId);
  if (!audit) return null;
  const [newest] = await listSnapshots(auditId);
  const since = newest ? newest.createdAt : audit.createdAt;
  if ((audit.activityAt ?? audit.updatedAt) <= since) return null;
  return takeSnapshot(auditId, reason);
}

/** Snapshots the audit every `intervalMs` while it keeps changing. Returns a stop function. */
export function startSnapshotTimer(auditId: string, intervalMs: number = SNAPSHOT_INTERVAL_MS): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await snapshotIfDirty(auditId, 'timer');
    } catch (err) {
      console.error('snapshot timer failed', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  return () => clearInterval(timer);
}
