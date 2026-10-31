import { test, expect } from 'vitest';
import { safeName, excelFilename, backupFilename } from '../../src/domain/filename';
import type { Audit } from '../../src/db/db';

const audit = (auditNo: string, auditDate: string) => ({ header: { auditNo, auditDate } }) as unknown as Audit;

test('safe names', () => {
  expect(safeName('HSSEW-004', 'audit')).toBe('HSSEW-004');
  expect(safeName('HSSE/W:004 ', 'audit')).toBe('HSSE-W-004');
  expect(safeName('', 'audit')).toBe('audit');
  expect(safeName('///', 'audit')).toBe('audit');
  expect(excelFilename(audit('HSSEW-004', '2026-10-28'))).toBe('HSSEW-004-HS-Audit-2026-10-28.xlsx');
  expect(backupFilename(audit('HSSEW-004', '2026-10-28'))).toBe('HSSEW-004-backup.zip');
  expect(excelFilename(audit('', ''))).toBe('audit-HS-Audit-undated.xlsx');
});
