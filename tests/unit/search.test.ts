import { test, expect } from 'vitest';
import { searchItems } from '../../src/domain/search';

const notes = new Map([['B3.2', 'Old NEOC 911 sticker on helmets']]);

test('matches id, text and note, case-insensitively, all terms', () => {
  expect(searchItems('b6', notes).map((h) => h.item.id)).toEqual([
    'B6.1', 'B6.2', 'B6.3', 'B6.4', 'B6.5', 'B6.6', 'B6.7', 'B6.8', 'B6.9',
  ]);
  expect(searchItems('fire extinguishers', notes).map((h) => h.item.id)).toEqual(['B9.1']);
  expect(searchItems('helmets', notes)[0]).toMatchObject({ item: { id: 'B3.2' }, matchedIn: ['note'] });
  expect(searchItems('   ', notes)).toEqual([]);
  expect(searchItems('zzzz', notes)).toEqual([]);
});
