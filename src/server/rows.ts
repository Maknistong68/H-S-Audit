import type { Answer, Audit, AuditHeader, AuditStatus, MediaOwner, MediaRow, Positive } from '../db/db';
import { answerId } from '../db/ids';
import type { Result } from '../domain/types';
import type { RemoteRow, SyncTable } from '../sync/types';

/** Server shapes: exactly the columns of the hs_ tables (spec 3.2). Timestamps are epoch ms. */
export interface HsAuditRow extends RemoteRow {
  id: string;
  audit_no: string;
  contractor_wo: string;
  project_name: string;
  auditors: string;
  audit_date: string | null;
  contact_number: string;
  contractor_id: string | null;
  status: AuditStatus;
  template_version: string;
  last_export_at: number | null;
  deleted_at: number | null;
  created_by?: string;
  created_at: number;
}

export interface HsAnswerRow extends RemoteRow {
  audit_id: string;
  item_id: string;
  result: Result | null;
  note: string;
  flagged: boolean;
  repeated: boolean;
}

export interface HsPositiveRow extends RemoteRow {
  id: string;
  audit_id: string;
  text: string;
  position: number;
  deleted_at: number | null;
  created_by?: string;
  created_at: number;
}

export interface HsPhotoRow extends RemoteRow {
  id: string;
  audit_id: string;
  owner_kind: 'item' | 'positive';
  owner_id: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  thumb: string | null;
  storage_path: string;
  uploaded_at: number | null;
  deleted_at: number | null;
  created_by?: string;
  created_at: number;
}

export const HEADER_COLUMN: Record<keyof AuditHeader, string> = {
  contractorWo: 'contractor_wo',
  projectName: 'project_name',
  auditors: 'auditors',
  auditDate: 'audit_date',
  auditNo: 'audit_no',
  contactNumber: 'contact_number',
};

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const orUndef = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);

function syncColumns(local: { updatedAt: number; updatedBy?: string; fieldAt?: Record<string, number>; serverAt?: string }) {
  const cols: Partial<RemoteRow> = { updated_at: local.updatedAt, field_at: local.fieldAt ?? {} };
  if (local.updatedBy !== undefined) cols.updated_by = local.updatedBy;
  if (local.serverAt !== undefined) cols.server_at = local.serverAt;
  return cols as Pick<RemoteRow, 'updated_at' | 'field_at'> & Partial<RemoteRow>;
}

function localSync(r: RemoteRow) {
  return { updatedAt: r.updated_at, updatedBy: orUndef(r.updated_by), fieldAt: r.field_at ?? {}, serverAt: orUndef(r.server_at) };
}

/** Drops keys whose value is undefined so `toEqual` comparisons and IndexedDB rows stay clean. */
function compact<T extends object>(obj: T): T {
  for (const k of Object.keys(obj) as (keyof T)[]) if (obj[k] === undefined) delete obj[k];
  return obj;
}

export function auditToRemote(a: Audit): HsAuditRow {
  return {
    id: a.id,
    audit_no: a.header.auditNo,
    contractor_wo: a.header.contractorWo,
    project_name: a.header.projectName,
    auditors: a.header.auditors,
    audit_date: a.header.auditDate || null,
    contact_number: a.header.contactNumber,
    contractor_id: orNull(a.contractorId),
    status: a.status,
    template_version: a.templateVersion,
    last_export_at: orNull(a.lastExportAt),
    deleted_at: orNull(a.deletedAt),
    ...(a.createdBy !== undefined ? { created_by: a.createdBy } : {}),
    created_at: a.createdAt,
    ...syncColumns(a),
  };
}

/** `prev` carries the local-only fields (activity, localOnly, importedAt) that the server never stores. */
export function auditToLocal(r: HsAuditRow, prev?: Audit): Audit {
  return compact({
    ...(prev ? { localOnly: prev.localOnly, activityAt: prev.activityAt, activityBy: prev.activityBy, importedAt: prev.importedAt } : {}),
    id: r.id,
    templateVersion: r.template_version,
    status: r.status,
    header: {
      contractorWo: r.contractor_wo ?? '',
      projectName: r.project_name ?? '',
      auditors: r.auditors ?? '',
      auditDate: r.audit_date ?? '',
      auditNo: r.audit_no ?? '',
      contactNumber: r.contact_number ?? '',
    },
    createdAt: r.created_at,
    createdBy: orUndef(r.created_by),
    contractorId: orUndef(r.contractor_id),
    lastExportAt: orUndef(r.last_export_at),
    deletedAt: orUndef(r.deleted_at),
    ...localSync(r),
  });
}

export function answerToRemote(a: Answer): HsAnswerRow {
  return { audit_id: a.auditId, item_id: a.itemId, result: orNull(a.result), note: a.note, flagged: a.flagged, repeated: a.repeated, ...syncColumns(a) };
}

export function answerToLocal(r: HsAnswerRow): Answer {
  return compact({
    id: answerId(r.audit_id, r.item_id),
    auditId: r.audit_id,
    itemId: r.item_id,
    result: orUndef(r.result),
    note: r.note ?? '',
    flagged: !!r.flagged,
    repeated: !!r.repeated,
    ...localSync(r),
  });
}

export function positiveToRemote(p: Positive): HsPositiveRow {
  return {
    id: p.id,
    audit_id: p.auditId,
    text: p.text,
    position: p.order,
    deleted_at: orNull(p.deletedAt),
    ...(p.createdBy !== undefined ? { created_by: p.createdBy } : {}),
    created_at: p.createdAt ?? p.updatedAt,
    ...syncColumns(p),
  };
}

export function positiveToLocal(r: HsPositiveRow): Positive {
  return compact({
    id: r.id,
    auditId: r.audit_id,
    text: r.text ?? '',
    order: r.position ?? 0,
    deletedAt: orUndef(r.deleted_at),
    createdBy: orUndef(r.created_by),
    createdAt: r.created_at,
    ...localSync(r),
  });
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

export const photoStoragePath = (auditId: string, photoId: string) => `${auditId}/${photoId}.jpg`;

export function photoToRemote(m: MediaRow): HsPhotoRow {
  return {
    id: m.id,
    audit_id: m.auditId,
    owner_kind: m.owner.kind,
    owner_id: m.owner.kind === 'item' ? m.owner.itemId : m.owner.positiveId,
    mime: m.mime,
    bytes: m.bytes,
    width: orNull(m.width),
    height: orNull(m.height),
    thumb: m.thumb ? toBase64(m.thumb) : null,
    storage_path: m.storagePath ?? photoStoragePath(m.auditId, m.id),
    uploaded_at: orNull(m.uploadedAt),
    deleted_at: orNull(m.deletedAt),
    ...(m.createdBy !== undefined ? { created_by: m.createdBy } : {}),
    created_at: m.createdAt,
    ...syncColumns({ updatedAt: m.updatedAt ?? m.createdAt, updatedBy: m.updatedBy, fieldAt: m.fieldAt, serverAt: m.serverAt }),
  };
}

export function photoToLocal(r: HsPhotoRow, prev?: MediaRow): MediaRow {
  const owner: MediaOwner = r.owner_kind === 'item' ? { kind: 'item', itemId: r.owner_id } : { kind: 'positive', positiveId: r.owner_id };
  return compact({
    id: r.id,
    auditId: r.audit_id,
    owner,
    type: 'photo' as const,
    mime: r.mime,
    bytes: r.bytes,
    width: orUndef(r.width),
    height: orUndef(r.height),
    thumb: r.thumb ? fromBase64(r.thumb) : prev?.thumb,
    createdAt: r.created_at,
    createdBy: orUndef(r.created_by),
    storagePath: r.storage_path,
    uploadedAt: orUndef(r.uploaded_at),
    deletedAt: orUndef(r.deleted_at),
    ...localSync(r),
  });
}

/** Canonical string key of a row, used to match outbox entries to rows. */
export function rowKey(table: SyncTable, key: Record<string, string>): string {
  return table === 'hs_answers' ? `${table}:${key.audit_id}:${key.item_id}` : `${table}:${key.id}`;
}

export function keyOf(table: SyncTable, local: { id: string; auditId?: string; itemId?: string }): Record<string, string> {
  return table === 'hs_answers' ? { audit_id: local.auditId!, item_id: local.itemId! } : { id: local.id };
}

export type LocalRowOf<T extends SyncTable> = T extends 'hs_audits' ? Audit : T extends 'hs_answers' ? Answer : T extends 'hs_positives' ? Positive : MediaRow;

export function toRemote(table: SyncTable, local: Audit | Answer | Positive | MediaRow): RemoteRow {
  switch (table) {
    case 'hs_audits':
      return auditToRemote(local as Audit);
    case 'hs_answers':
      return answerToRemote(local as Answer);
    case 'hs_positives':
      return positiveToRemote(local as Positive);
    case 'hs_photos':
      return photoToRemote(local as MediaRow);
  }
}

export function toLocal(table: SyncTable, row: RemoteRow, prev?: Audit | Answer | Positive | MediaRow): Audit | Answer | Positive | MediaRow {
  switch (table) {
    case 'hs_audits':
      return auditToLocal(row as HsAuditRow, prev as Audit | undefined);
    case 'hs_answers':
      return answerToLocal(row as HsAnswerRow);
    case 'hs_positives':
      return positiveToLocal(row as HsPositiveRow);
    case 'hs_photos':
      return photoToLocal(row as HsPhotoRow, prev as MediaRow | undefined);
  }
}
