import { test, expect } from 'vitest';
import { classify, rowFromBroadcast, toRpcChanges } from '../../src/server/supabaseRemote';

test('toRpcChanges passes table, key, fields and at through untouched', () => {
  const changes = [{ table: 'hs_answers' as const, key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'no' }, at: 5 }];
  expect(toRpcChanges(changes)).toEqual([{ table: 'hs_answers', key: { audit_id: 'a', item_id: 'A1' }, fields: { result: 'no' }, at: 5 }]);
});

test('rowFromBroadcast maps a database broadcast to a table and row, and ignores unknown tables', () => {
  const record = { audit_id: 'a', item_id: 'A1', result: 'no', updated_at: 5, field_at: { result: 5 }, server_at: '2026-11-02T10:00:00Z' };
  expect(rowFromBroadcast({ operation: 'UPDATE', table: 'hs_answers', record })).toEqual({ table: 'hs_answers', row: record });
  expect(rowFromBroadcast({ operation: 'INSERT', table: 'profiles', record: { id: 'x' } })).toBeNull();
  expect(rowFromBroadcast({ operation: 'DELETE', table: 'hs_answers', record: null })).toBeNull();
});

test('classify maps Supabase errors to the four kinds', () => {
  expect(classify({ message: 'JWT expired', code: 'PGRST301' }).kind).toBe('auth');
  expect(classify({ message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }).kind).toBe('auth');
  expect(classify({ message: 'new row violates row-level security policy', code: '42501' }).kind).toBe('permission');
  expect(classify({ message: 'forbidden', status: 403 }).kind).toBe('permission');
  expect(classify({ message: 'field nope is not allowed', code: 'P0001' }).kind).toBe('validation');
  expect(classify({ message: 'invalid input syntax', code: '22P02' }).kind).toBe('validation');
  expect(classify({ message: 'Object not found', status: 404 }).kind).toBe('validation');
  expect(classify({ message: 'TypeError: Failed to fetch' }).kind).toBe('network');
  expect(classify({ message: 'Load failed', status: 0 }).kind).toBe('network');
  expect(classify({ message: 'something else', status: 500 }).kind).toBe('unknown');
  expect(classify({ message: 'x' }).message).toBe('x');
});
