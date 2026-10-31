import { allItems, builtInTags, checklist, defaultTagsFor } from '../data/checklist';
import { joinText } from '../domain/text';
import type { Result } from '../domain/types';
import {
  db,
  type Answer,
  type Audit,
  type AuditHeader,
  type AuditStatus,
  type Media,
  type MediaOwner,
  type MediaRow,
  type Positive,
  type Tag,
} from './db';
import { answerId, newId, ownerKey, todayIso } from './ids';

export interface AuditSummary extends Audit {
  answered: number;
  flagged: number;
  total: number;
}

export type NewMedia = Omit<Media, 'id' | 'createdAt' | 'bytes' | 'deletedAt'>;

export interface MediaFilter {
  owner?: MediaOwner;
  includeDeleted?: boolean;
  type?: Media['type'];
}

/** Typed in place of the audit number when purging an audit that has none. */
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

async function touch(auditId: string, now = Date.now()): Promise<void> {
  await db.audits.update(auditId, { updatedAt: now });
}

async function upsertAnswer(auditId: string, itemId: string, patch: Partial<Answer> | ((current: Answer) => Partial<Answer>)): Promise<void> {
  const id = answerId(auditId, itemId);
  const now = Date.now();
  await db.transaction('rw', db.answers, db.audits, async () => {
    const existing = await db.answers.get(id);
    const base: Answer = existing ?? { id, auditId, itemId, note: '', flagged: false, repeated: false, updatedAt: now };
    const change = typeof patch === 'function' ? patch(base) : patch;
    await db.answers.put({ ...base, ...change, updatedAt: now });
    await touch(auditId, now);
  });
}

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

async function withBytes(rows: MediaRow[]): Promise<Media[]> {
  const blobs = await db.mediaBlobs.bulkGet(rows.map((r) => r.id));
  return rows.map((row, i) => ({ ...row, data: blobs[i]?.data ?? new ArrayBuffer(0) }));
}

export const repo = {
  // ---- audits
  async createAudit(header: Partial<AuditHeader> = {}): Promise<Audit> {
    const now = Date.now();
    const audit: Audit = {
      id: newId(),
      templateVersion: checklist.templateVersion,
      status: 'draft',
      header: { ...emptyHeader(), ...header },
      createdAt: now,
      updatedAt: now,
    };
    await db.audits.add(audit);
    return audit;
  },

  async getAudit(id: string): Promise<Audit | undefined> {
    const a = await db.audits.get(id);
    return a ? normaliseAudit(a) : undefined;
  },

  async listAudits(opts: { includeArchived?: boolean } = {}): Promise<AuditSummary[]> {
    const audits = (await db.audits.toArray()).map(normaliseAudit);
    const visible = audits.filter((a) => opts.includeArchived || a.status !== 'archived');
    const total = allItems().length;
    const summaries = await Promise.all(
      visible.map(async (a) => {
        const answers = await db.answers.where('auditId').equals(a.id).toArray();
        return {
          ...a,
          answered: answers.filter((x) => x.result !== undefined).length,
          flagged: answers.filter((x) => x.flagged).length,
          total,
        };
      }),
    );
    return summaries.sort((x, y) => y.updatedAt - x.updatedAt);
  },

  async updateHeader(id: string, patch: Partial<AuditHeader>): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.audits, async () => {
      const audit = await db.audits.get(id);
      if (!audit) return;
      const current = normaliseAudit(audit);
      await db.audits.put({ ...current, header: { ...current.header, ...patch }, updatedAt: now });
    });
  },

  async setStatus(id: string, status: AuditStatus): Promise<void> {
    await db.audits.update(id, { status, updatedAt: Date.now() });
  },

  async markExported(id: string): Promise<void> {
    await db.audits.update(id, { lastExportAt: Date.now() });
  },

  archiveAudit(id: string): Promise<void> {
    return repo.setStatus(id, 'archived');
  },

  async purgeAudit(id: string, typedAuditNo: string): Promise<void> {
    const audit = await repo.getAudit(id);
    if (!audit) return;
    const expected = audit.header.auditNo.trim() || PURGE_FALLBACK_WORD;
    if (typedAuditNo.trim() !== expected) throw new Error('audit number does not match');
    await db.transaction('rw', [db.audits, db.answers, db.positives, db.media, db.mediaBlobs, db.snapshots, db.settings], async () => {
      const mediaIds = await db.media.where('auditId').equals(id).primaryKeys();
      await db.mediaBlobs.bulkDelete(mediaIds);
      await db.media.where('auditId').equals(id).delete();
      await db.answers.where('auditId').equals(id).delete();
      await db.positives.where('auditId').equals(id).delete();
      await db.snapshots.where('auditId').equals(id).delete();
      await db.settings.delete(`walk:${id}`);
      await db.audits.delete(id);
    });
  },

  // ---- answers
  getAnswers(auditId: string): Promise<Answer[]> {
    return db.answers.where('auditId').equals(auditId).toArray();
  },

  setResult(auditId: string, itemId: string, result: Result | undefined): Promise<void> {
    return upsertAnswer(auditId, itemId, { result });
  },

  setNote(auditId: string, itemId: string, note: string): Promise<void> {
    return upsertAnswer(auditId, itemId, { note });
  },

  /** Appends to whatever the note is at write time (dictation that arrives after the field is gone). */
  appendNote(auditId: string, itemId: string, text: string): Promise<void> {
    return upsertAnswer(auditId, itemId, (current) => ({ note: joinText(current.note, text) }));
  },

  setFlag(auditId: string, itemId: string, flagged: boolean): Promise<void> {
    return upsertAnswer(auditId, itemId, { flagged });
  },

  setRepeated(auditId: string, itemId: string, repeated: boolean): Promise<void> {
    return upsertAnswer(auditId, itemId, { repeated });
  },

  // ---- positive observations
  async listPositives(auditId: string): Promise<Positive[]> {
    const all = await db.positives.where('auditId').equals(auditId).toArray();
    return all.filter((p) => p.deletedAt === undefined).sort((a, b) => a.order - b.order);
  },

  async addPositive(auditId: string, text: string): Promise<Positive> {
    const now = Date.now();
    return db.transaction('rw', db.positives, db.audits, async () => {
      const existing = await db.positives.where('auditId').equals(auditId).toArray();
      const order = existing.reduce((max, p) => Math.max(max, p.order + 1), 0);
      const positive: Positive = { id: newId(), auditId, text, order, updatedAt: now };
      await db.positives.add(positive);
      await touch(auditId, now);
      return positive;
    });
  },

  async updatePositive(id: string, text: string): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.positives, db.audits, async () => {
      const p = await db.positives.get(id);
      if (!p) return;
      await db.positives.put({ ...p, text, updatedAt: now });
      await touch(p.auditId, now);
    });
  },

  async appendPositiveText(id: string, text: string): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.positives, db.audits, async () => {
      const p = await db.positives.get(id);
      if (!p) return;
      await db.positives.put({ ...p, text: joinText(p.text, text), updatedAt: now });
      await touch(p.auditId, now);
    });
  },

  async removePositive(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.positives, db.audits, async () => {
      const p = await db.positives.get(id);
      if (!p) return;
      await db.positives.put({ ...p, deletedAt: now, updatedAt: now });
      await touch(p.auditId, now);
    });
  },

  async restorePositive(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.positives, db.audits, async () => {
      const p = await db.positives.get(id);
      if (!p) return;
      const { deletedAt: _deleted, ...rest } = p;
      await db.positives.put({ ...rest, updatedAt: now });
      await touch(p.auditId, now);
    });
  },

  // ---- media
  async addMedia(input: NewMedia): Promise<Media> {
    const now = Date.now();
    const { data, ...meta } = input;
    const row: MediaRow = { ...meta, id: newId(), bytes: data.byteLength, createdAt: now };
    await db.transaction('rw', db.media, db.mediaBlobs, db.audits, async () => {
      await db.mediaBlobs.add({ id: row.id, data });
      await db.media.add(row);
      await touch(input.auditId, now);
    });
    return { ...row, data };
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
    const now = Date.now();
    await db.transaction('rw', db.media, db.audits, async () => {
      const m = await db.media.get(id);
      if (!m) return;
      await db.media.update(id, { deletedAt: now });
      await touch(m.auditId, now);
    });
  },

  async restoreMedia(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.media, db.audits, async () => {
      const m = await db.media.get(id);
      if (!m) return;
      await db.media.update(id, { deletedAt: undefined });
      await touch(m.auditId, now);
    });
  },

  // ---- tags
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
