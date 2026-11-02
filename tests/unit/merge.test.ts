import { test, expect } from 'vitest';
import { applyChange, mergeRows, nextAt } from '../../src/sync/merge';
import type { Change, RemoteRow } from '../../src/sync/types';

const key = { audit_id: 'a', item_id: 'A1' };
const change = (fields: Record<string, unknown>, at: number): Change => ({ table: 'hs_answers', key, fields, at });

test('applyChange creates a row with every field at `at`', () => {
  const { row, applied, skipped } = applyChange(undefined, change({ result: 'full', note: '' }, 10), 'u1');
  expect(row).toMatchObject({ audit_id: 'a', item_id: 'A1', result: 'full', note: '', updated_at: 10, updated_by: 'u1', field_at: { result: 10, note: 10 } });
  expect(applied).toEqual(['result', 'note']);
  expect(skipped).toEqual([]);
});

test('applyChange keeps a newer field and applies an older one per field', () => {
  const base = applyChange(undefined, change({ result: 'full', note: 'x' }, 10), 'u1').row;
  const older = applyChange(base, change({ result: 'no', note: 'older' }, 5), 'u2');
  expect(older.row.result).toBe('full');
  expect(older.row.note).toBe('x');
  expect(older.skipped).toEqual(['result', 'note']);
  expect(older.applied).toEqual([]);
  expect(older.row.updated_by).toBe('u1');
  expect(older.row.updated_at).toBe(10);
  const later = applyChange(base, change({ note: 'newer' }, 11), 'u2').row;
  expect(later).toMatchObject({ result: 'full', note: 'newer', updated_at: 11, updated_by: 'u2', field_at: { result: 10, note: 11 } });
});

test('applyChange is idempotent', () => {
  const once = applyChange(undefined, change({ result: 'partial' }, 7), 'u1').row;
  const twice = applyChange(once, change({ result: 'partial' }, 7), 'u1');
  expect(twice.row).toEqual(once);
  expect(twice.applied).toEqual([]);
});

test('applyChange never overwrites key fields and does not mutate its input', () => {
  const base = applyChange(undefined, change({ result: 'full' }, 10), 'u1').row;
  const frozen = JSON.stringify(base);
  const { row } = applyChange(base, { table: 'hs_answers', key, fields: { item_id: 'B1.1', note: 'n' }, at: 12 }, 'u2');
  expect(row.item_id).toBe('A1');
  expect(row.note).toBe('n');
  expect(JSON.stringify(base)).toBe(frozen);
});

test('mergeRows takes each field from the newer side, then re-applies newer pending patches', () => {
  const local = { result: 'partial', note: 'mine', updated_at: 20, field_at: { result: 20, note: 20 } } as RemoteRow;
  const incoming = { result: 'no', note: 'theirs', updated_at: 25, updated_by: 'u2', field_at: { result: 25, note: 15 }, server_at: '2026-11-02T10:00:00Z' } as RemoteRow;
  const merged = mergeRows(local, incoming, [change({ note: 'pending' }, 30)]);
  expect(merged).toMatchObject({ result: 'no', note: 'pending', updated_at: 30, field_at: { result: 25, note: 30 }, server_at: '2026-11-02T10:00:00Z' });
});

test('mergeRows with no local row returns the incoming row plus pending patches', () => {
  const incoming = { result: 'no', updated_at: 25, field_at: { result: 25 } } as RemoteRow;
  expect(mergeRows(undefined, incoming, [])).toEqual(incoming);
  expect(mergeRows(undefined, incoming, [change({ note: 'p' }, 26)])).toMatchObject({ result: 'no', note: 'p', field_at: { result: 25, note: 26 } });
});

test('mergeRows keeps a local field the server has never seen', () => {
  const local = { result: 'partial', note: 'mine', updated_at: 20, field_at: { result: 20, note: 20 } } as RemoteRow;
  const incoming = { result: 'no', updated_at: 25, field_at: { result: 25 } } as RemoteRow;
  expect(mergeRows(local, incoming, [])).toMatchObject({ result: 'no', note: 'mine', field_at: { result: 25, note: 20 } });
});

test('nextAt never goes below a seen field timestamp', () => {
  const row = { updated_at: 500, field_at: { note: 500, result: 100 } } as RemoteRow;
  expect(nextAt(100, row, ['note'])).toBe(501);
  expect(nextAt(900, row, ['note'])).toBe(900);
  expect(nextAt(100, row, ['result'])).toBe(101);
  expect(nextAt(100, undefined, ['note'])).toBe(100);
});
