import { test, expect } from 'vitest';
import { preflight } from '../../src/export/preflight';
import type { Answer, Audit } from '../../src/db/db';

test('lists unanswered, missing notes and empty header fields', () => {
  const audit = { header: { contractorWo: 'x', projectName: '', auditors: 'a', auditDate: '2026-10-28', auditNo: 'N', contactNumber: '' } } as unknown as Audit;
  const answers = new Map<string, Answer>([
    ['A1', { id: 'a:A1', auditId: 'a', itemId: 'A1', result: 'no', note: '', flagged: false, repeated: false, updatedAt: 0 }],
    ['A2', { id: 'a:A2', auditId: 'a', itemId: 'A2', result: 'partial', note: 'ok', flagged: false, repeated: false, updatedAt: 0 }],
  ]);
  const issues = preflight(audit, answers);
  expect(issues.filter((i) => i.kind === 'unanswered').length).toBe(79);
  expect(issues.filter((i) => i.kind === 'no-note').map((i) => i.ref)).toEqual(['A1']);
  expect(issues.filter((i) => i.kind === 'header').map((i) => i.label)).toEqual(['Project name', 'Contact number']);
});
