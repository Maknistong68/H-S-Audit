import { db, type Audit } from '../db/db';
import { HEADER_COLUMN } from '../server/rows';
import { queuePhoto, writeChange } from './outbox';
import { getWriter } from './writer';

/** Audits made before accounts existed (or imported from a backup) that the team has not received yet. */
export async function listLocalOnly(): Promise<Audit[]> {
  return db.audits.filter((a) => a.localOnly === true && a.deletedAt === undefined).toArray();
}

/**
 * Sends one local-only audit to the team as ordinary changes: the audit row, every answer, positive and photo,
 * each stamped with the time it was last edited on this phone. Ids are kept; the uploader becomes the creator.
 */
export async function uploadAudit(id: string): Promise<void> {
  const audit = await db.audits.get(id);
  if (!audit) return;
  const by = getWriter()?.id ?? 'local';
  const now = Date.now();

  const fields: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(HEADER_COLUMN)) {
    const value = audit.header?.[key as keyof typeof audit.header] ?? '';
    fields[column] = key === 'auditDate' ? value || null : value;
  }
  fields.status = audit.status;
  fields.template_version = audit.templateVersion;
  fields.created_at = audit.createdAt;
  if (audit.lastExportAt !== undefined) fields.last_export_at = audit.lastExportAt;
  if (audit.contractorId !== undefined) fields.contractor_id = audit.contractorId;
  await writeChange({ table: 'hs_audits', key: { id }, fields, at: audit.updatedAt || audit.createdAt || now });

  for (const a of await db.answers.where('auditId').equals(id).toArray()) {
    await writeChange({
      table: 'hs_answers',
      key: { audit_id: id, item_id: a.itemId },
      fields: { result: a.result ?? null, note: a.note ?? '', flagged: !!a.flagged, repeated: !!a.repeated },
      at: a.updatedAt || now,
    });
  }

  for (const p of await db.positives.where('auditId').equals(id).toArray()) {
    await writeChange({
      table: 'hs_positives',
      key: { id: p.id },
      fields: { audit_id: id, text: p.text, position: p.order, deleted_at: p.deletedAt ?? null, created_at: p.createdAt ?? p.updatedAt },
      at: p.updatedAt || now,
    });
    await db.positives.update(p.id, { createdBy: by });
  }

  for (const m of await db.media.where('[auditId+type]').equals([id, 'photo']).toArray()) {
    if (m.deletedAt !== undefined) continue; // a photo removed before the team ever saw it stays on this phone only
    await queuePhoto(m);
  }

  await db.audits.update(id, { localOnly: false, createdBy: by });
}

export async function uploadAllLocal(): Promise<number> {
  const audits = await listLocalOnly();
  for (const a of audits) await uploadAudit(a.id);
  return audits.length;
}
