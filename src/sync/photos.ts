import { db } from '../db/db';
import type { Remote } from '../server/remote';

/** Makes sure a photo's full-size bytes are on this device; false when they cannot be fetched right now. */
export async function ensurePhoto(remote: Remote, id: string): Promise<boolean> {
  const row = await db.media.get(id);
  if (!row) return false;
  if (await db.mediaBlobs.get(id)) return true;
  if (!row.storagePath || row.uploadedAt === undefined) return false; // still only on the phone that took it
  try {
    const data = await remote.downloadPhoto(row.storagePath);
    await db.mediaBlobs.put({ id, data });
    return true;
  } catch {
    return false;
  }
}

/** Fetches every missing photo of an audit (for export); reports the ones that are not available. */
export async function ensurePhotos(remote: Remote, auditId: string, onProgress?: (done: number, total: number) => void): Promise<{ missing: string[] }> {
  const rows = (await db.media.where('[auditId+type]').equals([auditId, 'photo']).toArray()).filter((m) => m.deletedAt === undefined);
  const missing: string[] = [];
  let done = 0;
  for (const row of rows) {
    if (!(await ensurePhoto(remote, row.id))) missing.push(row.id);
    done += 1;
    onProgress?.(done, rows.length);
  }
  return { missing };
}
