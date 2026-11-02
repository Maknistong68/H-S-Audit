import Dexie, { type Table } from 'dexie';
import type { Result } from '../domain/types';
import type { OutboxEntry } from '../sync/types';

export interface AuditHeader {
  contractorWo: string;
  projectName: string;
  auditors: string;
  /** YYYY-MM-DD */
  auditDate: string;
  auditNo: string;
  contactNumber: string;
}

export type AuditStatus = 'draft' | 'final' | 'archived';

/** The dashboard's app_role: viewers read, the rest edit, admins also manage the team. */
export type Role = 'viewer' | 'auditor' | 'lead' | 'admin';

/** Sync columns every synced row carries locally; `fieldAt` keys are server column names. */
export interface Synced {
  updatedBy?: string;
  fieldAt?: Record<string, number>;
  serverAt?: string;
}

export interface Audit extends Synced {
  id: string;
  templateVersion: string;
  status: AuditStatus;
  header: AuditHeader;
  createdAt: number;
  updatedAt: number;
  /** Last Excel or backup export. */
  lastExportAt?: number;
  /** Set when the audit was created by importing a backup. */
  importedAt?: number;
  createdBy?: string;
  /** Soft delete ("Delete for the team"); hidden everywhere but the admins' Deleted filter. */
  deletedAt?: number;
  /** The dashboard's contractors.id when picked. */
  contractorId?: string;
  /** Made before sign-in existed and not uploaded to the team yet. */
  localOnly?: boolean;
  /** Local only: newest change to the audit or anything in it, and who made it. */
  activityAt?: number;
  activityBy?: string;
}

export interface Answer extends Synced {
  /** `${auditId}:${itemId}` */
  id: string;
  auditId: string;
  itemId: string;
  result?: Result;
  note: string;
  flagged: boolean;
  repeated: boolean;
  updatedAt: number;
}

export interface Positive extends Synced {
  id: string;
  auditId: string;
  text: string;
  order: number;
  updatedAt: number;
  deletedAt?: number;
  createdBy?: string;
  createdAt?: number;
}

export type MediaOwner = { kind: 'item'; itemId: string } | { kind: 'positive'; positiveId: string };

/** Metadata of a photo or memo; the bytes live in `mediaBlobs` so lists and snapshots never load them. */
export interface MediaRow extends Synced {
  id: string;
  auditId: string;
  owner: MediaOwner;
  type: 'photo' | 'audio';
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  /** Photos only, ~200 px JPEG; small enough to keep with the metadata. */
  thumb?: ArrayBuffer;
  createdAt: number;
  deletedAt?: number;
  createdBy?: string;
  updatedAt?: number;
  /** `<auditId>/<id>.jpg` in the hs-photos bucket. */
  storagePath?: string;
  /** Set once the file is in Storage; until then the photo only exists on this phone. */
  uploadedAt?: number;
}

export interface MediaBlob {
  id: string;
  /** ArrayBuffer, not Blob: structured-clones identically in every browser and in tests. */
  data: ArrayBuffer;
}

/** A media row joined with its bytes. */
export interface Media extends MediaRow {
  data: ArrayBuffer;
  /** The full-size bytes are not on this device yet; `data` is the thumbnail. */
  fromThumb?: boolean;
}

export type SnapshotReason = 'timer' | 'navigation' | 'manual' | 'before-restore' | 'before-import';

export interface Snapshot {
  id: string;
  auditId: string;
  createdAt: number;
  reason: SnapshotReason;
  /** JSON of audit + answers + positives + media metadata (no blobs). */
  payload: string;
}

export interface TagOverride {
  itemId: string;
  tags: string[];
}

export interface Tag {
  id: string;
  label: string;
  builtIn: boolean;
}

export interface Setting {
  key: string;
  value: unknown;
}

/** A teammate, from the server's team directory. */
export interface Member {
  id: string;
  email: string;
  fullName: string | null;
  role: Role | null;
  confirmed: boolean;
}

/** A contractor from the dashboard's list, for the header picker. */
export interface Contractor {
  id: string;
  name: string;
  contractNo?: string;
}

const V1_STORES = {
  audits: 'id, status, updatedAt',
  answers: 'id, auditId',
  positives: 'id, auditId',
  media: 'id, auditId, [auditId+type]',
  snapshots: 'id, auditId, createdAt',
  tagOverrides: 'itemId',
  tags: 'id',
  settings: 'key',
};

export class HsAuditDb extends Dexie {
  audits!: Table<Audit, string>;
  answers!: Table<Answer, string>;
  positives!: Table<Positive, string>;
  media!: Table<MediaRow, string>;
  mediaBlobs!: Table<MediaBlob, string>;
  snapshots!: Table<Snapshot, string>;
  tagOverrides!: Table<TagOverride, string>;
  tags!: Table<Tag, string>;
  settings!: Table<Setting, string>;
  outbox!: Table<OutboxEntry, number>;
  members!: Table<Member, string>;
  contractors!: Table<Contractor, string>;

  constructor() {
    super('hs-audit');
    // Schema versions only ever add; never drop a table or field.
    this.version(1).stores(V1_STORES);
    // v2: bytes move out of `media` into `mediaBlobs` so reading metadata never loads photos and memos.
    this.version(2)
      .stores({ ...V1_STORES, mediaBlobs: 'id' })
      .upgrade(async (tx) => {
        const rows = (await tx.table('media').toArray()) as Array<MediaRow & { data?: ArrayBuffer }>;
        for (const row of rows) {
          if (!row.data) continue;
          await tx.table('mediaBlobs').put({ id: row.id, data: row.data });
          delete row.data;
          await tx.table('media').put(row);
        }
      });
    // v3: the team backend. Outbox of pending changes, the team directory, the contractor list, and
    // every audit that existed before accounts is marked local-only until it is uploaded.
    this.version(3)
      .stores({ ...V1_STORES, audits: 'id, status, updatedAt, deletedAt', mediaBlobs: 'id', outbox: '++seq, key, auditId', members: 'id', contractors: 'id' })
      .upgrade(async (tx) => {
        await tx.table('audits').toCollection().modify({ localOnly: true });
      });
  }
}

export const db = new HsAuditDb();
