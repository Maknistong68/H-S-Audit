import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { checklist } from '../data/checklist';
import { backupFilename } from '../domain/filename';
import { db, type Answer, type Audit, type MediaBlob, type MediaOwner, type MediaRow, type Positive } from './db';
import { answerId, newId } from './ids';
import { emptyHeader, normaliseAudit, repo } from './repo';
import { takeSnapshot, type MediaMeta } from './snapshots';
import { uploadAudit } from '../sync/uploadLocal';

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupMediaEntry extends MediaMeta {
  /** Path of the bytes inside the zip. */
  file: string;
  thumbFile?: string;
}

export interface BackupManifest {
  formatVersion: 1;
  templateVersion: string;
  audit: Audit;
  answers: Answer[];
  positives: Positive[];
  media: BackupMediaEntry[];
}

export function audioExt(mime: string): 'webm' | 'm4a' | 'ogg' | 'bin' {
  const m = mime.toLowerCase();
  if (m.startsWith('audio/webm')) return 'webm';
  if (m.startsWith('audio/mp4') || m.startsWith('audio/m4a') || m.startsWith('audio/aac')) return 'm4a';
  if (m.startsWith('audio/ogg')) return 'ogg';
  return 'bin';
}

/** One zip: audit.json plus photos/, thumbs/ and audio/ — stored, not compressed; media is already compressed. */
export async function buildBackup(auditId: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const audit = await repo.getAudit(auditId);
  if (!audit) throw new Error('audit not found');
  const [answers, positives, media] = await Promise.all([
    db.answers.where('auditId').equals(auditId).toArray(),
    db.positives.where('auditId').equals(auditId).toArray(),
    repo.listMedia(auditId, { includeDeleted: true }),
  ]);

  const files: Record<string, Uint8Array> = {};
  const entries: BackupMediaEntry[] = media.map((m) => {
    const file = m.type === 'photo' ? `photos/${m.id}.jpg` : `audio/${m.id}.${audioExt(m.mime)}`;
    files[file] = new Uint8Array(m.data);
    const { data: _data, thumb, ...meta } = m;
    let thumbFile: string | undefined;
    if (thumb) {
      thumbFile = `thumbs/${m.id}.jpg`;
      files[thumbFile] = new Uint8Array(thumb);
    }
    return { ...meta, file, thumbFile };
  });

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    templateVersion: audit.templateVersion,
    audit,
    answers,
    positives,
    media: entries,
  };
  files['audit.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const bytes = zipSync(files, { level: 0 });
  await repo.markExported(auditId);
  return { bytes, filename: backupFilename(audit) };
}

const copyBuffer = (u8: Uint8Array): ArrayBuffer => u8.slice().buffer as ArrayBuffer;

const INVALID = 'This file is not a valid HSE Audit backup.';
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Rejects anything that could not have come from this app, before a single row is written. */
function parseManifest(raw: string): BackupManifest {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    throw new Error(INVALID);
  }
  if (!isObject(m)) throw new Error(INVALID);
  if (m.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Backup format ${String(m.formatVersion)} is not supported by this app version.`);
  }
  if (!isObject(m.audit) || !isObject(m.audit.header)) throw new Error(INVALID);
  if (!Array.isArray(m.answers) || !Array.isArray(m.positives) || !Array.isArray(m.media)) throw new Error(INVALID);
  for (const a of m.answers) if (!isObject(a) || typeof a.itemId !== 'string') throw new Error(INVALID);
  for (const p of m.positives) if (!isObject(p) || typeof p.id !== 'string' || typeof p.text !== 'string') throw new Error(INVALID);
  for (const e of m.media) {
    if (!isObject(e) || typeof e.id !== 'string' || typeof e.file !== 'string' || !isObject(e.owner)) throw new Error(INVALID);
    if (e.type !== 'photo' && e.type !== 'audio') throw new Error(INVALID);
  }
  return m as unknown as BackupManifest;
}

/** Creates a NEW audit from a backup; never overwrites an existing one. */
export async function importBackup(bytes: Uint8Array): Promise<{ auditId: string; warnings: string[] }> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This file is not a backup zip.');
  }
  const manifestBytes = files['audit.json'];
  if (!manifestBytes) throw new Error('This zip has no audit.json — not an HSE Audit backup.');
  const manifest = parseManifest(strFromU8(manifestBytes));

  const warnings: string[] = [];
  if (manifest.templateVersion !== checklist.templateVersion) {
    warnings.push(`Backup was made with checklist ${manifest.templateVersion}; this app uses ${checklist.templateVersion}.`);
  }

  const now = Date.now();
  const auditId = newId();
  const source = normaliseAudit(manifest.audit);
  const audit: Audit = {
    ...source,
    id: auditId,
    templateVersion: typeof source.templateVersion === 'string' ? source.templateVersion : manifest.templateVersion,
    header: { ...emptyHeader(), ...source.header },
    status: 'draft', // an imported audit is always something to look at, never hidden in the archive
    createdAt: now,
    updatedAt: now,
    importedAt: now,
    lastExportAt: now, // the backup file itself is the export
    localOnly: true, // until uploadAudit below has queued it for the team
  };
  const answers: Answer[] = manifest.answers.map((a) => ({
    ...a,
    id: answerId(auditId, a.itemId),
    auditId,
    note: typeof a.note === 'string' ? a.note : '',
    flagged: !!a.flagged,
    repeated: !!a.repeated,
    updatedAt: typeof a.updatedAt === 'number' ? a.updatedAt : now,
  }));
  const positiveIds = new Map(manifest.positives.map((p) => [p.id, newId()]));
  const positives: Positive[] = manifest.positives.map((p, i) => ({
    ...p,
    id: positiveIds.get(p.id)!,
    auditId,
    order: typeof p.order === 'number' ? p.order : i,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
  }));

  const rows: MediaRow[] = [];
  const blobs: MediaBlob[] = [];
  for (const entry of manifest.media) {
    const data = files[entry.file];
    if (!data) {
      warnings.push(`Missing media file ${entry.file}; skipped.`);
      continue;
    }
    const { file: _file, thumbFile, ...meta } = entry;
    const owner: MediaOwner =
      meta.owner.kind === 'positive' ? { kind: 'positive', positiveId: positiveIds.get(meta.owner.positiveId) ?? meta.owner.positiveId } : meta.owner;
    const thumb = thumbFile && files[thumbFile] ? copyBuffer(files[thumbFile]) : undefined;
    const id = newId();
    rows.push({ ...meta, id, auditId, owner, bytes: data.byteLength, createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : now, ...(thumb ? { thumb } : {}) });
    blobs.push({ id, data: copyBuffer(data) });
  }

  await db.transaction('rw', [db.audits, db.answers, db.positives, db.media, db.mediaBlobs], async () => {
    await db.audits.add(audit);
    await db.answers.bulkAdd(answers);
    await db.positives.bulkAdd(positives);
    await db.mediaBlobs.bulkAdd(blobs);
    await db.media.bulkAdd(rows);
  });
  await uploadAudit(auditId); // an imported audit is a team audit from the start
  await takeSnapshot(auditId, 'before-import');
  return { auditId, warnings };
}
