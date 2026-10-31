import { allItems } from '../data/checklist';
import type { ChecklistItem } from './types';

export type SearchField = 'id' | 'text' | 'note';

export interface SearchHit {
  item: ChecklistItem;
  matchedIn: SearchField[];
}

/**
 * Case-insensitive search over item id, question text and the auditor's note.
 * Every whitespace-separated term must match in at least one field; checklist order is kept.
 */
export function searchItems(
  query: string,
  notes: ReadonlyMap<string, string>,
  items: ChecklistItem[] = allItems(),
): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const item of items) {
    const fields: Record<SearchField, string> = {
      id: item.id.toLowerCase(),
      text: item.text.toLowerCase(),
      note: (notes.get(item.id) ?? '').toLowerCase(),
    };
    const matchedIn = new Set<SearchField>();
    let allTermsMatch = true;
    for (const term of terms) {
      let termMatched = false;
      for (const field of ['id', 'text', 'note'] as const) {
        if (fields[field].includes(term)) {
          matchedIn.add(field);
          termMatched = true;
        }
      }
      if (!termMatched) {
        allTermsMatch = false;
        break;
      }
    }
    if (allTermsMatch) hits.push({ item, matchedIn: [...matchedIn] });
  }
  return hits;
}
