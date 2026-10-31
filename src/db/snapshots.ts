import { db, type Answer, type Audit, type Media, type Positive, type Snapshot, type SnapshotReason } from './db';
import { newId } from './ids';

export const SNAPSHOT_LIMIT = 40;
export const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

export type { SnapshotReason };

export type MediaMeta = Omit<Media, 'data' | 'thumb'>;

export interface SnapshotPayload {
  formatVersion: 1;
  audit: Audit;
  answers: Answer[];
  positives: Positive[];
  media: MediaMeta[];
}

function stripMedia(m: Media): MediaMeta {
  const { data: _data, thumb: _thumb, ...meta } = m;
  return meta;
}

/** Everything about an audit except media bytes. */
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

export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const snapshot = await db.snapshots.get(snapshotId);
  if (!snapshot) throw new Error('snapshot not found');
  const payload = JSON.parse(snapshot.payload) as SnapshotPayload;
  const auditId = snapshot.auditId;
  await takeSnapshot(auditId, 'before-restore');
  const now = Date.now();
  await db.transaction('rw', [db.audits, db.answers, db.positives, db.media], async () => {
    const current = await db.audits.get(auditId);
    if (!current) throw new Error('audit not found');
    await db.audits.put({ ...current, header: payload.audit.header, status: payload.audit.status, updatedAt: now });
    await db.answers.where('auditId').equals(auditId).delete();
    await db.answers.bulkPut(payload.answers);
    await db.positives.where('auditId').equals(auditId).delete();
    await db.positives.bulkPut(payload.positives);
    for (const meta of payload.media) {
      const row = await db.media.get(meta.id);
      if (!row) continue; // bytes are gone (purged); nothing to relink
      const { deletedAt: _deleted, ...rest } = row;
      await db.media.put(meta.deletedAt === undefined ? rest : { ...rest, deletedAt: meta.deletedAt });
    }
  });
}

/**
 * Snapshots the audit every `intervalMs` while it has changed since the last snapshot (or since the timer
 * started). Returns a stop function.
 */
export function startSnapshotTimer(auditId: string, intervalMs: number = SNAPSHOT_INTERVAL_MS): () => void {
  let lastSeen = Date.now();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const audit = await db.audits.get(auditId);
      if (!audit) return;
      const [newest] = await listSnapshots(auditId);
      const since = newest ? Math.max(newest.createdAt, lastSeen) : lastSeen;
      if (audit.updatedAt > since) {
        const snap = await takeSnapshot(auditId, 'timer');
        lastSeen = snap.createdAt;
      }
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
