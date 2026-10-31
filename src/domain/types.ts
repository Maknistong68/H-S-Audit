export type Result = 'full' | 'partial' | 'no' | 'na';
export type SectionId = 'A' | 'B' | 'C';

export interface ChecklistItem {
  id: string;
  text: string;
  weight: 1 | 2 | 3;
  /** Row of the item in the template sheet (Part 1). */
  row: number;
  sectionId: SectionId;
  subsectionId: string;
  /** Row of the item in the template's Part 3 findings list. */
  part3Row: number;
}

export interface Subsection {
  id: string;
  title: string;
  /** Section A has no subsections in the sheet; it gets one implicit subsection. */
  implicit: boolean;
  items: ChecklistItem[];
}

export interface Section {
  id: SectionId;
  title: string;
  subsections: Subsection[];
}

export interface Checklist {
  templateVersion: string;
  sections: Section[];
}
