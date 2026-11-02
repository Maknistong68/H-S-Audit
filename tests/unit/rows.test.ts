import { test, expect } from 'vitest';
import type { Answer, Audit, MediaRow, Positive } from '../../src/db/db';
import {
  answerToLocal,
  answerToRemote,
  auditToLocal,
  auditToRemote,
  fromBase64,
  keyOf,
  photoToLocal,
  photoToRemote,
  positiveToLocal,
  positiveToRemote,
  rowKey,
  toBase64,
  toLocal,
  toRemote,
} from '../../src/server/rows';

const audit: Audit = {
  id: 'a',
  templateVersion: 'book2-2026-10',
  status: 'draft',
  header: { contractorWo: 'WO', projectName: 'P', auditors: 'J', auditDate: '2026-11-02', auditNo: 'HSSEW-006', contactNumber: '055' },
  createdAt: 1,
  updatedAt: 2,
  fieldAt: { audit_no: 2 },
  createdBy: 'u1',
  contractorId: '4800001322',
};

test('audit round-trips through the server shape', () => {
  const r = auditToRemote(audit);
  expect(r).toMatchObject({
    id: 'a',
    audit_no: 'HSSEW-006',
    contractor_wo: 'WO',
    project_name: 'P',
    auditors: 'J',
    audit_date: '2026-11-02',
    contact_number: '055',
    status: 'draft',
    template_version: 'book2-2026-10',
    created_at: 1,
    created_by: 'u1',
    updated_at: 2,
    field_at: { audit_no: 2 },
    contractor_id: '4800001322',
    deleted_at: null,
    last_export_at: null,
  });
  expect(auditToLocal(r)).toEqual(audit);
});

test('an empty audit date becomes null and comes back as an empty string', () => {
  const r = auditToRemote({ ...audit, header: { ...audit.header, auditDate: '' } });
  expect(r.audit_date).toBeNull();
  expect(auditToLocal(r).header.auditDate).toBe('');
});

test('local-only fields survive a round trip through the previous local row', () => {
  const prev: Audit = { ...audit, localOnly: false, activityAt: 99, activityBy: 'u1', importedAt: 5 };
  expect(auditToLocal(auditToRemote(prev), prev)).toMatchObject({ activityAt: 99, activityBy: 'u1', importedAt: 5 });
});

test('answer round-trips and rebuilds the local id', () => {
  const answer: Answer = { id: 'a:B9.1', auditId: 'a', itemId: 'B9.1', result: 'no', note: 'n', flagged: true, repeated: false, updatedAt: 3, updatedBy: 'u1', fieldAt: { result: 3 } };
  const r = answerToRemote(answer);
  expect(r).toMatchObject({ audit_id: 'a', item_id: 'B9.1', result: 'no', note: 'n', flagged: true, repeated: false, updated_at: 3, updated_by: 'u1', field_at: { result: 3 } });
  expect(answerToLocal(r)).toEqual(answer);
  expect(answerToLocal({ ...r, result: null }).result).toBeUndefined();
});

test('positive round-trips with order as position', () => {
  const p: Positive = { id: 'p1', auditId: 'a', text: 't', order: 2, updatedAt: 4, createdAt: 3, deletedAt: 5, fieldAt: { text: 4 } };
  const r = positiveToRemote(p);
  expect(r).toMatchObject({ id: 'p1', audit_id: 'a', text: 't', position: 2, deleted_at: 5, updated_at: 4, created_at: 3 });
  expect(positiveToRemote({ ...p, createdAt: undefined }).created_at).toBe(4); // rows from before sync fall back to updatedAt
  expect(positiveToLocal(r)).toEqual(p);
});

test('photo thumb goes to base64 and back', () => {
  const buf = new Uint8Array([255, 216, 255, 0, 1, 2, 3]).buffer;
  expect(fromBase64(toBase64(buf))).toEqual(buf);
  const row: MediaRow = { id: 'm1', auditId: 'a', owner: { kind: 'item', itemId: 'A1' }, type: 'photo', mime: 'image/jpeg', bytes: 7, width: 4, height: 3, thumb: buf, createdAt: 9, storagePath: 'a/m1.jpg', uploadedAt: 10, updatedAt: 10, fieldAt: { uploaded_at: 10 } };
  const r = photoToRemote(row);
  expect(r.thumb).toMatch(/^[A-Za-z0-9+/=]+$/);
  expect(r).toMatchObject({ id: 'm1', audit_id: 'a', owner_kind: 'item', owner_id: 'A1', storage_path: 'a/m1.jpg', uploaded_at: 10, bytes: 7, width: 4, height: 3 });
  expect(photoToLocal(r)).toEqual(row);
  const positiveOwner = photoToRemote({ ...row, owner: { kind: 'positive', positiveId: 'p1' } });
  expect(positiveOwner).toMatchObject({ owner_kind: 'positive', owner_id: 'p1' });
  expect(photoToLocal(positiveOwner).owner).toEqual({ kind: 'positive', positiveId: 'p1' });
});

test('rowKey and keyOf agree', () => {
  expect(rowKey('hs_answers', { audit_id: 'a', item_id: 'B9.1' })).toBe('hs_answers:a:B9.1');
  expect(rowKey('hs_audits', { id: 'a' })).toBe('hs_audits:a');
  expect(keyOf('hs_answers', { id: 'a:B9.1', auditId: 'a', itemId: 'B9.1' } as Answer)).toEqual({ audit_id: 'a', item_id: 'B9.1' });
  expect(keyOf('hs_photos', { id: 'm1' } as MediaRow)).toEqual({ id: 'm1' });
});

test('toRemote and toLocal dispatch by table', () => {
  expect(toRemote('hs_audits', audit)).toEqual(auditToRemote(audit));
  expect(toLocal('hs_audits', auditToRemote(audit))).toEqual(audit);
});
