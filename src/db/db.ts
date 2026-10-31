import Dexie, { type Table } from 'dexie';
import type { Result } from '../domain/types';

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

export interface Audit {
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
}

export interface Answer {
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

export interface Positive {
  id: string;
  auditId: string;
  text: string;
  order: number;
  updatedAt: number;
  deletedAt?: number;
}

export type MediaOwner = { kind: 'item'; itemId: string } | { kind: 'positive'; positiveId: string };

export interface Media {
  id: string;
  auditId: string;
  owner: MediaOwner;
  type: 'photo' | 'audio';
  /** ArrayBuffer, not Blob: structured-clones identically in every browser and in tests. */
  data: ArrayBuffer;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  /** Photos only, ~200 px JPEG. */
  thumb?: ArrayBuffer;
  createdAt: number;
  deletedAt?: number;
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

export class HsAuditDb extends Dexie {
  audits!: Table<Audit, string>;
  answers!: Table<Answer, string>;
  positives!: Table<Positive, string>;
  media!: Table<Media, string>;
  snapshots!: Table<Snapshot, string>;
  tagOverrides!: Table<TagOverride, string>;
  tags!: Table<Tag, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('hs-audit');
    // Schema versions only ever add; never drop a table or field.
    this.version(1).stores({
      audits: 'id, status, updatedAt',
      answers: 'id, auditId',
      positives: 'id, auditId',
      media: 'id, auditId, [auditId+type]',
      snapshots: 'id, auditId, createdAt',
      tagOverrides: 'itemId',
      tags: 'id',
      settings: 'key',
    });
  }
}

export const db = new HsAuditDb();
