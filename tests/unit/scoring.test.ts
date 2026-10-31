import { test, expect } from 'vitest';
import fixture from '../fixtures/book2-results.json';
import { scoreAudit, itemPoints, bandFor } from '../../src/domain/scoring';
import type { Result } from '../../src/domain/types';

const book2 = new Map(Object.entries(fixture) as [string, Result][]);

test('golden values from Book2', () => {
  const s = scoreAudit(book2);
  const [A, B, C] = s.sections;
  expect([A.tally.points, A.tally.possible]).toEqual([25.5, 36]);
  expect([B.tally.points, B.tally.possible]).toEqual([45, 69]);
  expect([C.tally.points, C.tally.possible]).toEqual([34, 36]);
  expect(s.overall).toBeCloseTo(0.76832, 4);
  expect(s.band).toBe('moderately');
  expect(s.negatives).toBe(25);
  expect(s.unanswered).toBe(0);
  expect(B.subsections.find((x) => x.id === 'B6')!.ratio).toBeCloseTo(8 / 15, 6);
});

test('item points', () => {
  expect(itemPoints(3, 'full')).toEqual({ points: 3, possible: 3 });
  expect(itemPoints(3, 'partial')).toEqual({ points: 1.5, possible: 3 });
  expect(itemPoints(2, 'no')).toEqual({ points: 0, possible: 2 });
  expect(itemPoints(2, 'na')).toEqual({ points: 0, possible: 0 });
  expect(itemPoints(2, undefined)).toEqual({ points: 0, possible: 0 });
});

test('empty and all-N/A audits are N/A, never NaN', () => {
  const empty = scoreAudit(new Map());
  expect(empty.overall).toBeNull();
  expect(empty.band).toBeNull();
  expect(empty.unanswered).toBe(81);
  const allNa = new Map([...book2.keys()].map((k) => [k, 'na' as const]));
  const s = scoreAudit(allNa);
  expect(s.sections.every((x) => x.ratio === null)).toBe(true);
  expect(s.overall).toBeNull();
});

test('overall ignores N/A sections', () => {
  const onlyA = new Map([['A1', 'full' as const]]);
  expect(scoreAudit(onlyA).overall).toBe(1);
});

test('bands at boundaries', () => {
  expect(bandFor(0.9)).toBe('compliant');
  expect(bandFor(0.895)).toBe('compliant');
  expect(bandFor(0.894)).toBe('mostly');
  expect(bandFor(0.8)).toBe('mostly');
  expect(bandFor(0.7)).toBe('moderately');
  expect(bandFor(0.6)).toBe('minimally');
  expect(bandFor(0.594)).toBe('non'); // 59.4 rounds to 59; 0.599 would round to 60 = minimally
  expect(bandFor(0)).toBe('non');
});
