import { test, expect } from 'vitest';
import { checklist, allItems, itemById, subsectionsOf, builtInTags, defaultTagsFor } from '../../src/data/checklist';

test('81 items in three sections', () => {
  expect(allItems().length).toBe(81);
  expect(checklist.sections.map((s) => s.id)).toEqual(['A', 'B', 'C']);
  expect(checklist.sections.map((s) => s.subsections.flatMap((x) => x.items).length)).toEqual([15, 36, 30]);
});

test('rows, weights and part3 rows match Book2', () => {
  expect(itemById('A1')).toMatchObject({ row: 9, weight: 3, sectionId: 'A', subsectionId: 'A', part3Row: 155 });
  expect(itemById('B6.7')).toMatchObject({ row: 53, weight: 2, subsectionId: 'B6' });
  expect(itemById('C2.19')).toMatchObject({ row: 109, weight: 1, part3Row: 235 });
  expect(allItems().reduce((s, i) => s + i.weight, 0)).toBe(153); // A 45 + B 70 + C 38
});

test('subsections', () => {
  expect(subsectionsOf().map((s) => s.id)).toEqual([
    'A', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'C1', 'C2',
  ]);
  expect(subsectionsOf()[0].implicit).toBe(true);
});

test('tags', () => {
  expect(builtInTags.map((t) => t.id)).toContain('clinic');
  expect(builtInTags.length).toBe(17);
  expect(defaultTagsFor('B11.1')).toEqual(['clinic']);
  expect(defaultTagsFor('B6.7')).toEqual(['electrical', 'documentation', 'site-walk']);
  for (const i of allItems()) expect(defaultTagsFor(i.id).length).toBeGreaterThan(0);
});
