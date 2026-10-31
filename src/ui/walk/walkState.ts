import { allItems, checklist } from '../../data/checklist';
import type { Answer } from '../../db/db';
import { searchItems } from '../../domain/search';
import type { Checklist, ChecklistItem } from '../../domain/types';

export type WalkMode = 'sequence' | 'area' | 'search';

export interface WalkState {
  mode: WalkMode;
  tag: string | null;
  query: string;
  remainingOnly: boolean;
  expandedId: string | null;
}

export const DEFAULT_WALK_STATE: WalkState = { mode: 'sequence', tag: null, query: '', remainingOnly: false, expandedId: null };

export interface WalkRow {
  kind: 'section' | 'subsection' | 'item';
  id: string;
  title?: string;
  item?: ChecklistItem;
}

const isAnswered = (answers: ReadonlyMap<string, Answer>, id: string) => answers.get(id)?.result !== undefined;

/** Finished: Full or N/A, or No/Partial with a written note. A No/Partial without a note still needs work. */
export function isComplete(answer: Answer | undefined): boolean {
  if (!answer?.result) return false;
  if (answer.result === 'no' || answer.result === 'partial') return answer.note.trim() !== '';
  return true;
}

/** The rows the Walk list shows for a given mode/filter; headers without visible items are dropped. */
export function visibleRows(
  state: WalkState,
  answers: ReadonlyMap<string, Answer>,
  tagsByItem: ReadonlyMap<string, string[]>,
  c: Checklist = checklist,
): WalkRow[] {
  // "Remaining" hides finished questions, but never the one that is open: answering must not make it vanish.
  const visible = (item: ChecklistItem) => !state.remainingOnly || item.id === state.expandedId || !isComplete(answers.get(item.id));
  const itemRow = (item: ChecklistItem): WalkRow => ({ kind: 'item', id: item.id, item });

  if (state.mode === 'sequence') {
    const rows: WalkRow[] = [];
    for (const section of c.sections) {
      const sectionRows: WalkRow[] = [];
      for (const sub of section.subsections) {
        const items = sub.items.filter(visible);
        if (items.length === 0) continue;
        if (!sub.implicit) sectionRows.push({ kind: 'subsection', id: sub.id, title: sub.title });
        sectionRows.push(...items.map(itemRow));
      }
      if (sectionRows.length > 0) rows.push({ kind: 'section', id: section.id, title: section.title }, ...sectionRows);
    }
    return rows;
  }

  if (state.mode === 'area') {
    if (!state.tag) return [];
    return allItems(c)
      .filter((item) => (tagsByItem.get(item.id) ?? []).includes(state.tag!) && visible(item))
      .map(itemRow);
  }

  const notes = new Map<string, string>();
  for (const [id, a] of answers) notes.set(id, a.note);
  return searchItems(state.query, notes, allItems(c))
    .map((hit) => hit.item)
    .filter(visible)
    .map(itemRow);
}

/** First unanswered item after `fromId` in `rows` (wrapping around); null when every item is answered. */
export function nextUnanswered(fromId: string | null, rows: WalkRow[], answers: ReadonlyMap<string, Answer>): string | null {
  const items = rows.filter((r) => r.kind === 'item');
  if (items.length === 0) return null;
  const start = fromId ? items.findIndex((r) => r.id === fromId) : -1;
  for (let k = 1; k <= items.length; k++) {
    const candidate = items[(start + k) % items.length];
    if (!isAnswered(answers, candidate.id)) return candidate.id;
  }
  return null;
}

/** How many items carry each tag, and how many of those are answered. */
export function tagCounts(
  tagsByItem: ReadonlyMap<string, string[]>,
  answers: ReadonlyMap<string, Answer>,
): Map<string, { total: number; done: number }> {
  const counts = new Map<string, { total: number; done: number }>();
  for (const [itemId, tags] of tagsByItem) {
    const done = isAnswered(answers, itemId) ? 1 : 0;
    for (const tag of tags) {
      const c = counts.get(tag) ?? { total: 0, done: 0 };
      c.total += 1;
      c.done += done;
      counts.set(tag, c);
    }
  }
  return counts;
}

/** Id of the item adjacent to `fromId` in `rows`, or null at the ends. */
export function adjacentItem(fromId: string | null, rows: WalkRow[], direction: 1 | -1): string | null {
  const items = rows.filter((r) => r.kind === 'item');
  if (items.length === 0) return null;
  if (!fromId) return items[0].id;
  const idx = items.findIndex((r) => r.id === fromId);
  if (idx === -1) return items[0].id;
  const next = items[idx + direction];
  return next ? next.id : null;
}

/** The next question after `fromId` (wrapping) that is not finished, never `fromId` itself; null when none. */
export function nextIncomplete(fromId: string, rows: WalkRow[], answers: ReadonlyMap<string, Answer>): string | null {
  const items = rows.filter((r) => r.kind === 'item');
  const start = items.findIndex((r) => r.id === fromId);
  for (let k = 1; k < items.length; k++) {
    const candidate = items[(start + k + items.length) % items.length];
    if (candidate.id !== fromId && !isComplete(answers.get(candidate.id))) return candidate.id;
  }
  return null;
}
