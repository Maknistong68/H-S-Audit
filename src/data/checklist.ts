import raw from './checklist.json';
import tagData from './tags.json';
import type { Checklist, ChecklistItem, Section, SectionId, Subsection } from '../domain/types';

interface RawItem { id: string; text: string; weight: number; row: number }
interface RawSubsection { id: string; title: string; implicit: boolean; items: RawItem[] }
interface RawSection { id: string; title: string; subsections: RawSubsection[] }
interface RawChecklist { templateVersion: string; sections: RawSection[] }

/** First row of the Part 3 findings list in the template; one row per item in checklist order. */
export const PART3_FIRST_ROW = 155;

function build(data: RawChecklist): Checklist {
  let index = 0;
  const sections: Section[] = data.sections.map((s) => {
    const sectionId = s.id as SectionId;
    const subsections: Subsection[] = s.subsections.map((sub) => ({
      id: sub.id,
      title: sub.title,
      implicit: sub.implicit,
      items: sub.items.map((it): ChecklistItem => ({
        id: it.id,
        text: it.text,
        weight: it.weight as 1 | 2 | 3,
        row: it.row,
        sectionId,
        subsectionId: sub.id,
        part3Row: PART3_FIRST_ROW + index++,
      })),
    }));
    return { id: sectionId, title: s.title, subsections };
  });
  return { templateVersion: data.templateVersion, sections };
}

export const checklist: Checklist = build(raw as RawChecklist);

const items: ChecklistItem[] = checklist.sections.flatMap((s) => s.subsections.flatMap((x) => x.items));
const byId = new Map(items.map((i) => [i.id, i]));

export function allItems(c: Checklist = checklist): ChecklistItem[] {
  return c === checklist ? items : c.sections.flatMap((s) => s.subsections.flatMap((x) => x.items));
}

export function itemById(id: string, c: Checklist = checklist): ChecklistItem | undefined {
  return c === checklist ? byId.get(id) : allItems(c).find((i) => i.id === id);
}

export function subsectionsOf(c: Checklist = checklist): Subsection[] {
  return c.sections.flatMap((s) => s.subsections);
}

export const builtInTags: { id: string; label: string }[] = tagData.tags;

const defaults: Record<string, string[]> = tagData.defaults;

export function defaultTagsFor(itemId: string): string[] {
  return defaults[itemId] ?? [];
}
