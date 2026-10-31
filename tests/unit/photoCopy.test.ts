import { test, expect } from 'vitest';
import { photoCopyFilename } from '../../src/media/photoCopy';

test('gallery copy file names carry audit, item and time', () => {
  const at = new Date(2026, 9, 31, 14, 32, 5); // local time
  expect(photoCopyFilename('HSSEW-004', { kind: 'item', itemId: 'B9.1' }, at)).toBe('HSSEW-004_B9-1_20261031-143205.jpg');
  expect(photoCopyFilename('', { kind: 'item', itemId: 'A1' }, at)).toBe('audit_A1_20261031-143205.jpg');
  expect(photoCopyFilename('HSSE/W:4', { kind: 'positive', positiveId: 'p1' }, at)).toBe('HSSE-W-4_positive_20261031-143205.jpg');
});
