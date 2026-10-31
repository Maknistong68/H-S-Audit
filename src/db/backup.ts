import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { checklist } from '../data/checklist';
import { backupFilename } from '../domain/filename';
import { db, type Answer, type Audit, type Media, type MediaOwner, type Positive } from './db';
import { answerId, newId } from './ids';
import { repo } from './repo';
import { takeSnapshot, type MediaMeta } from './snapshots';

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
  const audit = await db.audits.get(auditId);
  if (!audit) throw new Error('audit not found');
  const [answers, positives, media] = await Promise.all([
    db.answers.where('auditId').equals(auditId).toArray(),
    db.positives.where('auditId').equals(auditId).toArray(),
    db.media.where('auditId').equals(auditId).toArray(),
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
  const manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest;
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Backup format ${String(manifest.formatVersion)} is not supported by this app version.`);
  }

  const warnings: string[] = [];
  if (manifest.templateVersion !== checklist.templateVersion) {
    warnings.push(`Backup was made with checklist ${manifest.templateVersion}; this app uses ${checklist.templateVersion}.`);
  }

  const now = Date.now();
  const auditId = newId();
  const audit: Audit = {
    ...manifest.audit,
    id: auditId,
    createdAt: now,
    updatedAt: now,
    importedAt: now,
    lastExportAt: now, // the backup file itself is the export
  };
  const answers: Answer[] = manifest.answers.map((a) => ({ ...a, id: answerId(auditId, a.itemId), auditId }));
  const positiveIds = new Map(manifest.positives.map((p) => [p.id, newId()]));
  const positives: Positive[] = manifest.positives.map((p) => ({ ...p, id: positiveIds.get(p.id)!, auditId }));

  const media: Media[] = [];
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
    media.push({ ...meta, id: newId(), auditId, owner, data: copyBuffer(data), bytes: data.byteLength, ...(thumb ? { thumb } : {}) });
  }

  await db.transaction('rw', [db.audits, db.answers, db.positives, db.media], async () => {
    await db.audits.add(audit);
    await db.answers.bulkAdd(answers);
    await db.positives.bulkAdd(positives);
    await db.media.bulkAdd(media);
  });
  await takeSnapshot(auditId, 'before-import');
  return { auditId, warnings };
}
