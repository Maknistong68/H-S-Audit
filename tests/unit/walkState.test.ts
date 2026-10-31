import { test, expect } from 'vitest';
import { visibleRows, nextUnanswered, tagCounts, isComplete, DEFAULT_WALK_STATE } from '../../src/ui/walk/walkState';
import { allItems, defaultTagsFor } from '../../src/data/checklist';
import type { Answer } from '../../src/db/db';

const tags = new Map(allItems().map((i) => [i.id, defaultTagsFor(i.id)]));
const ans = (o: Record<string, Answer['result']>) =>
  new Map<string, Answer>(
    Object.entries(o).map(([k, result]) => [k, { id: `a:${k}`, auditId: 'a', itemId: k, result, note: '', flagged: false, repeated: false, updatedAt: 0 }]),
  );

test('sequence rows have headers and all 81 items', () => {
  const rows = visibleRows(DEFAULT_WALK_STATE, new Map(), tags);
  expect(rows.filter((r) => r.kind === 'item').length).toBe(81);
  expect(rows.filter((r) => r.kind === 'section').length).toBe(3);
  expect(rows.filter((r) => r.kind === 'subsection').length).toBe(14);
  expect(rows[0]).toMatchObject({ kind: 'section', id: 'A' });
  expect(rows[1]).toMatchObject({ kind: 'item', id: 'A1' });
});

test('area mode filters by tag, remainingOnly drops answered, empty headers dropped', () => {
  const rows = visibleRows({ ...DEFAULT_WALK_STATE, mode: 'area', tag: 'clinic' }, new Map(), tags);
  expect(rows.map((r) => r.id)).toEqual(['B11.1', 'B11.2', 'B11.3', 'B12.1', 'B12.2', 'C2.8']);
  const seq = visibleRows({ ...DEFAULT_WALK_STATE, remainingOnly: true }, ans({ A1: 'full' }), tags);
  expect(seq.find((r) => r.id === 'A1')).toBeUndefined();
  const allA = Object.fromEntries(allItems().filter((i) => i.sectionId === 'A').map((i) => [i.id, 'full' as const]));
  expect(visibleRows({ ...DEFAULT_WALK_STATE, remainingOnly: true }, ans(allA), tags).find((r) => r.kind === 'section' && r.id === 'A')).toBeUndefined();
});

test('search mode and next unanswered', () => {
  const rows = visibleRows({ ...DEFAULT_WALK_STATE, mode: 'search', query: 'extinguisher' }, new Map(), tags);
  expect(rows.map((r) => r.id)).toEqual(['B9.1']);
  const seq = visibleRows(DEFAULT_WALK_STATE, ans({ A1: 'full', A2: 'no' }), tags);
  expect(nextUnanswered('A1', seq, ans({ A1: 'full', A2: 'no' }))).toBe('A3');
  expect(nextUnanswered('C2.19', seq, ans({ A1: 'full' }))).toBe('A2');
  expect(nextUnanswered(null, seq, ans({}))).toBe('A1');
});

test('remaining only: Full/N/A are done, No/Partial stay until they have a note, the open question never vanishes', () => {
  const withNotes = (o: Record<string, [Answer['result'], string]>) =>
    new Map<string, Answer>(
      Object.entries(o).map(([k, [result, note]]) => [k, { id: `a:${k}`, auditId: 'a', itemId: k, result, note, flagged: false, repeated: false, updatedAt: 0 }]),
    );
  const answers = withNotes({ A1: ['full', ''], A2: ['na', ''], A3: ['no', ''], A4: ['partial', '  '], A5: ['no', 'Plan not approved.'], A6: ['partial', 'Partly done.'] });
  const ids = (expandedId: string | null) =>
    visibleRows({ ...DEFAULT_WALK_STATE, remainingOnly: true, expandedId }, answers, tags)
      .filter((r) => r.kind === 'item')
      .map((r) => r.id);
  const shown = ids(null);
  expect(shown).not.toContain('A1');
  expect(shown).not.toContain('A2');
  expect(shown).toContain('A3'); // No without a note is not finished
  expect(shown).toContain('A4'); // a blank note does not count
  expect(shown).not.toContain('A5');
  expect(shown).not.toContain('A6');
  expect(shown).toContain('A7'); // unanswered
  expect(ids('A1')).toContain('A1'); // the question being worked on stays put
  expect(isComplete(answers.get('A3'))).toBe(false);
  expect(isComplete(answers.get('A5'))).toBe(true);
  expect(isComplete(undefined)).toBe(false);
});

test('tag counts', () => {
  const c = tagCounts(tags, ans({ 'B11.1': 'full' }));
  expect(c.get('clinic')).toEqual({ total: 6, done: 1 });
});
