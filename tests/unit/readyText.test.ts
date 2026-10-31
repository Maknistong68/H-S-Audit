import { test, expect } from 'vitest';
import { allItems } from '../../src/data/checklist';
import { readyTextFor } from '../../src/data/readyText';

const sentences = (s: string) => (s.match(/[.!?](\s|$)/g) ?? []).length;

test('every question has at least five 2–3 sentence findings', () => {
  for (const item of allItems()) {
    const texts = readyTextFor(item.id);
    expect(texts.length, item.id).toBeGreaterThanOrEqual(5);
    for (const t of texts) {
      expect(sentences(t), `${item.id}: ${t}`).toBeGreaterThanOrEqual(2);
      expect(sentences(t), `${item.id}: ${t}`).toBeLessThanOrEqual(3);
      expect(t, item.id).not.toMatch(/\n|\[|XX/);
    }
    expect(new Set(texts).size, `${item.id} has duplicates`).toBe(texts.length);
  }
});

test('texts are specific to their question, not copied across items', () => {
  const seen = new Map<string, string>();
  for (const item of allItems()) {
    for (const t of readyTextFor(item.id)) {
      expect(seen.get(t), `"${t}" used by ${seen.get(t)} and ${item.id}`).toBeUndefined();
      seen.set(t, item.id);
    }
  }
});

test('unknown item has no texts', () => {
  expect(readyTextFor('Z9')).toEqual([]);
});
