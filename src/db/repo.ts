import { allItems, builtInTags, checklist, defaultTagsFor } from '../data/checklist';
import { appendText } from '../domain/text';
import type { Result } from '../domain/types';
import { HEADER_COLUMN } from '../server/rows';
import { pendingCounts, writeChange, writePhoto } from '../sync/outbox';
import { getWriter } from '../sync/writer';
import {
  db,
  type Answer,
  type Audit,
  type AuditHeader,
  type AuditStatus,
  type Contractor,
  type Media,
  type MediaOwner,
  type MediaRow,
  type Member,
  type Positive,
  type Tag,
} from './db';
import { newId, ownerKey, todayIso } from './ids';

export interface AuditSummary extends Audit {
  answered: number;
  flagged: number;
  total: number;
  /** Changes made on this device that have not reached the team yet. */
  pending: number;
}

export type AuditFilter = 'all' | 'mine' | 'archived' | 'deleted';

export type NewMedia = Omit<Media, 'id' | 'createdAt' | 'bytes' | 'deletedAt'>;

export interface MediaFilter {
  owner?: MediaOwner;
  includeDeleted?: boolean;
  type?: Media['type'];
}

/** Typed in place of the audit number when deleting an audit that has none. */
export const PURGE_FALLBACK_WORD = 'DELETE';

export const emptyHeader = (): AuditHeader => ({
  contractorWo: '',
  projectName: '',
  auditors: '',
  auditDate: todayIso(),
  auditNo: '',
  contactNumber: '',
});

/** A row written by an older version, a bad import or by hand must never crash a screen. */
export function normaliseAudit(a: Audit): Audit {
  const header = (a.header && typeof a.header === 'object' ? a.header : {}) as Partial<AuditHeader>;
  const clean: AuditHeader = { ...emptyHeader() };
  for (const key of Object.keys(clean) as (keyof AuditHeader)[]) {
    if (typeof header[key] === 'string') clean[key] = header[key] as string;
  }
  return { ...a, header: clean, status: a.status ?? 'draft', createdAt: a.createdAt ?? 0, updatedAt: a.updatedAt ?? 0 };
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const answerKey = (auditId: string, itemId: string) => ({ audit_id: auditId, item_id: itemId });

function answerChange(auditId: string, itemId: string, fields: Record<string, unknown> | ((current: Answer) => Record<string, unknown>)): Promise<void> {
  return writeChange({
    table: 'hs_answers',
    key: answerKey(auditId, itemId),
    fields: typeof fields === 'function' ? (current) => fields({ note: '', ...(current as Partial<Answer>) } as Answer) : fields,
  });
}

const positiveChange = (id: string, fields: Record<string, unknown> | ((current: { text: string }) => Record<string, unknown>)) =>
  writeChange({ table: 'hs_positives', key: { id }, fields: typeof fields === 'function' ? (current) => fields({ text: String(current?.text ?? '') }) : fields });

async function ensureTagsSeeded(): Promise<void> {
  if ((await db.tags.count()) === 0) {
    await db.tags.bulkPut(builtInTags.map((t) => ({ id: t.id, label: t.label, builtIn: true })));
  }
}

function matches(filter: MediaFilter, key: string | null) {
  return (m: MediaRow) =>
    (filter.includeDeleted || m.deletedAt === undefined) && (key === null || ownerKey(m.owner) === key) && (!filter.type || m.type === filter.type);
}

async function mediaRows(auditId: string, filter: MediaFilter): Promise<MediaRow[]> {
  const rows = filter.type
    ? await db.media.where('[auditId+type]').equals([auditId, filter.type]).toArray()
    : await db.media.where('auditId').equals(auditId).toArray();
  const key = filter.owner ? ownerKey(filter.owner) : null;
  return rows.filter(matches(filter, key)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** Joins bytes; a photo whose full file is not on this device yet falls back to its thumbnail. */
async function withBytes(rows: MediaRow[]): Promise<Media[]> {
  const blobs = await db.mediaBlobs.bulkGet(rows.map((r) => r.id));
  return rows.map((row, i) => {
    const data = blobs[i]?.data;
    if (data) return { ...row, data };
    return { ...row, data: row.thumb ?? new ArrayBuffer(0), fromThumb: !!row.thumb };
  });
}

const headerFields = (patch: Partial<AuditHeader>): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields[HEADER_COLUMN[k as keyof AuditHeader]] = k === 'auditDate' ? v || null : v;
  }
  return fields;
};

export const repo = {
  // ---- audits
  async createAudit(header: Partial<AuditHeader> = {}): Promise<Audit> {
    const now = Date.now();
    const id = newId();
    await writeChange({
      table: 'hs_audits',
      key: { id },
      fields: { ...headerFields({ ...emptyHeader(), ...header }), status: 'draft', template_version: checklist.templateVersion, created_at: now },
      at: now,
    });
    return (await repo.getAudit(id))!;
  },

  async getAudit(id: string): Promise<Audit | undefined> {
    const a = await db.audits.get(id);
    return a ? normaliseAudit(a) : undefined;
  },

  async listAudits(opts: { filter?: AuditFilter; me?: string } = {}): Promise<AuditSummary[]> {
    const filter = opts.filter ?? 'all';
    const audits = (await db.audits.toArray()).map(normaliseAudit);
    const visible = audits.filter((a) => {
      const deleted = a.deletedAt !== undefined;
      if (filter === 'deleted') return deleted;
      if (deleted) return false;
      if (filter === 'archived') return a.status === 'archived';
      if (a.status === 'archived') return false;
      return filter === 'all' || a.createdBy === opts.me;
    });
    const total = allItems().length;
    const { byAudit } = await pendingCounts();
    const summaries = await Promise.all(
      visible.map(async (a) => {
        const answers = await db.answers.where('auditId').equals(a.id).toArray();
        return {
          ...a,
          answered: answers.filter((x) => x.result !== undefined).length,
          flagged: answers.filter((x) => x.flagged).length,
          total,
          pending: byAudit.get(a.id) ?? 0,
        };
      }),
    );
    return summaries.sort((x, y) => (y.activityAt ?? y.updatedAt) - (x.activityAt ?? x.updatedAt));
  },

  async updateHeader(id: string, patch: Partial<AuditHeader> & { contractorId?: string | null }): Promise<void> {
    const { contractorId, ...header } = patch;
    const fields = headerFields(header);
    if (contractorId !== undefined) fields.contractor_id = contractorId;
    if (Object.keys(fields).length === 0) return;
    await writeChange({ table: 'hs_audits', key: { id }, fields });
  },

  async setStatus(id: string, status: AuditStatus): Promise<void> {
    await writeChange({ table: 'hs_audits', key: { id }, fields: { status } });
  },

  async markExported(id: string): Promise<void> {
    await writeChange({ table: 'hs_audits', key: { id }, fields: { last_export_at: Date.now() } });
  },

  archiveAudit(id: string): Promise<void> {
    return repo.setStatus(id, 'archived');
  },

  /** "Delete for the team": a soft delete everyone sees; only this phone's copy of the photo bytes is freed. */
  async deleteAudit(id: string, typedAuditNo: string): Promise<void> {
    const audit = await repo.getAudit(id);
    if (!audit) return;
    const expected = audit.header.auditNo.trim() || PURGE_FALLBACK_WORD;
    if (typedAuditNo.trim() !== expected) throw new Error('audit number does not match');
    await writeChange({ table: 'hs_audits', key: { id }, fields: { deleted_at: Date.now() } });
    await db.transaction('rw', [db.media, db.mediaBlobs, db.settings], async () => {
      const mediaIds = await db.media.where('auditId').equals(id).primaryKeys();
      await db.mediaBlobs.bulkDelete(mediaIds);
      await db.settings.delete(`walk:${id}`);
    });
  },

  async restoreAudit(id: string): Promise<void> {
    await writeChange({ table: 'hs_audits', key: { id }, fields: { deleted_at: null } });
  },

  // ---- answers
  getAnswers(auditId: string): Promise<Answer[]> {
    return db.answers.where('auditId').equals(auditId).toArray();
  },

  setResult(auditId: string, itemId: string, result: Result | undefined): Promise<void> {
    return answerChange(auditId, itemId, { result: result ?? null });
  },

  setNote(auditId: string, itemId: string, note: string): Promise<void> {
    return answerChange(auditId, itemId, { note });
  },

  /** Appends to whatever the note is at write time (dictation that arrives after the field is gone). */
  appendNote(auditId: string, itemId: string, text: string): Promise<void> {
    return answerChange(auditId, itemId, (current) => ({ note: appendText(current.note, text) }));
  },

  setFlag(auditId: string, itemId: string, flagged: boolean): Promise<void> {
    return answerChange(auditId, itemId, { flagged });
  },

  setRepeated(auditId: string, itemId: string, repeated: boolean): Promise<void> {
    return answerChange(auditId, itemId, { repeated });
  },

  // ---- positive observations
  async listPositives(auditId: string): Promise<Positive[]> {
    const all = await db.positives.where('auditId').equals(auditId).toArray();
    return all.filter((p) => p.deletedAt === undefined).sort((a, b) => a.order - b.order);
  },

  async addPositive(auditId: string, text: string): Promise<Positive> {
    const now = Date.now();
    const existing = await db.positives.where('auditId').equals(auditId).toArray();
    const order = existing.reduce((max, p) => Math.max(max, p.order + 1), 0);
    const id = newId();
    await writeChange({ table: 'hs_positives', key: { id }, fields: { audit_id: auditId, text, position: order, created_at: now }, at: now });
    return (await db.positives.get(id))!;
  },

  updatePositive(id: string, text: string): Promise<void> {
    return positiveChange(id, { text });
  },

  appendPositiveText(id: string, text: string): Promise<void> {
    return positiveChange(id, (current) => ({ text: appendText(current.text, text) }));
  },

  removePositive(id: string): Promise<void> {
    return positiveChange(id, { deleted_at: Date.now() });
  },

  restorePositive(id: string): Promise<void> {
    return positiveChange(id, { deleted_at: null });
  },

  // ---- media
  async addMedia(input: NewMedia): Promise<Media> {
    const now = Date.now();
    const { data, ...meta } = input;
    const row: MediaRow = { ...meta, id: newId(), bytes: data.byteLength, createdAt: now };
    if (row.type === 'photo') {
      await writePhoto(row, data);
    } else {
      // Audio memos are no longer recorded; rows from older audits stay on this device only.
      await db.transaction('rw', db.media, db.mediaBlobs, async () => {
        await db.mediaBlobs.add({ id: row.id, data });
        await db.media.add(row);
      });
    }
    return { ...(await db.media.get(row.id))!, data };
  },

  /** Metadata only (thumbnails included): cheap enough for live lists and snapshots. */
  listMediaMeta(auditId: string, filter: MediaFilter = {}): Promise<MediaRow[]> {
    return mediaRows(auditId, filter);
  },

  /** Metadata joined with the bytes; use for export, backup and playback, not for lists. */
  async listMedia(auditId: string, filter: MediaFilter = {}): Promise<Media[]> {
    return withBytes(await mediaRows(auditId, filter));
  },

  async getMedia(id: string): Promise<Media | undefined> {
    const row = await db.media.get(id);
    if (!row) return undefined;
    const [media] = await withBytes([row]);
    return media;
  },

  async softDeleteMedia(id: string): Promise<void> {
    const m = await db.media.get(id);
    if (!m) return;
    if (m.type === 'photo') await writeChange({ table: 'hs_photos', key: { id }, fields: { deleted_at: Date.now() } });
    else await db.media.update(id, { deletedAt: Date.now() });
  },

  async restoreMedia(id: string): Promise<void> {
    const m = await db.media.get(id);
    if (!m) return;
    if (m.type === 'photo') await writeChange({ table: 'hs_photos', key: { id }, fields: { deleted_at: null } });
    else await db.media.update(id, { deletedAt: undefined });
  },

  // ---- team
  async memberName(id: string): Promise<string> {
    if (id === getWriter()?.id) return 'you';
    const m = await db.members.get(id);
    return m?.fullName || m?.email || 'Someone';
  },

  listMembers(): Promise<Member[]> {
    return db.members.toArray();
  },

  async listContractors(): Promise<Contractor[]> {
    return (await db.contractors.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  },

  // ---- tags (kept for older data; no screen edits them any more)
  async getItemTags(itemId: string): Promise<string[]> {
    const override = await db.tagOverrides.get(itemId);
    return override ? override.tags : defaultTagsFor(itemId);
  },

  async setItemTags(itemId: string, tags: string[]): Promise<void> {
    await db.tagOverrides.put({ itemId, tags });
  },

  /** Tags for every checklist item: the override where one exists, else the defaults. */
  async listItemTags(): Promise<Map<string, string[]>> {
    const overrides = new Map((await db.tagOverrides.toArray()).map((o) => [o.itemId, o.tags]));
    return new Map(allItems().map((i) => [i.id, overrides.get(i.id) ?? defaultTagsFor(i.id)]));
  },

  /** Read-only (safe inside liveQuery): built-in tags come from code until the table is first written. */
  async listTags(): Promise<Tag[]> {
    const stored = await db.tags.toArray();
    const all: Tag[] = stored.length === 0 ? builtInTags.map((t) => ({ id: t.id, label: t.label, builtIn: true })) : stored;
    const order = new Map(builtInTags.map((t, i) => [t.id, i]));
    const builtIn = all.filter((t) => t.builtIn).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const custom = all.filter((t) => !t.builtIn).sort((a, b) => a.label.localeCompare(b.label));
    return [...builtIn, ...custom];
  },

  async addTag(label: string): Promise<Tag> {
    await ensureTagsSeeded();
    const id = slug(label);
    if (!id) throw new Error('Tag name is empty');
    if (await db.tags.get(id)) throw new Error(`Tag "${label}" already exists`);
    const tag: Tag = { id, label: label.trim(), builtIn: false };
    await db.tags.add(tag);
    return tag;
  },

  async renameTag(id: string, label: string): Promise<void> {
    await ensureTagsSeeded();
    await db.tags.update(id, { label: label.trim() });
  },

  // ---- settings
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await db.settings.get(key);
    return row === undefined ? fallback : (row.value as T);
  },

  async setSetting(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key, value });
  },
};
