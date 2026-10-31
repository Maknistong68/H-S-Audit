import { checklist } from '../data/checklist';
import type { Checklist, Result, SectionId } from './types';

export type Band = 'compliant' | 'mostly' | 'moderately' | 'minimally' | 'non';

export const BAND_LABELS: Record<Band, string> = {
  compliant: 'Compliant',
  mostly: 'Mostly Compliant',
  moderately: 'Moderately Compliant',
  minimally: 'Minimally Compliant',
  non: 'Non-Compliant',
};

export interface Tally {
  points: number;
  possible: number;
  answered: number;
  unanswered: number;
  na: number;
}

export interface SubsectionScore {
  id: string;
  title: string;
  tally: Tally;
  ratio: number | null;
}

export interface SectionScore {
  id: SectionId;
  title: string;
  tally: Tally;
  ratio: number | null;
  subsections: SubsectionScore[];
}

export interface AuditScore {
  sections: SectionScore[];
  overall: number | null;
  band: Band | null;
  unanswered: number;
  /** Items answered No or Partial. */
  negatives: number;
}

/** Full = weight, Partial = half, No = 0; N/A and unanswered contribute nothing to either side. */
export function itemPoints(weight: number, result: Result | undefined): { points: number; possible: number } {
  switch (result) {
    case 'full':
      return { points: weight, possible: weight };
    case 'partial':
      return { points: weight * 0.5, possible: weight };
    case 'no':
      return { points: 0, possible: weight };
    default:
      return { points: 0, possible: 0 };
  }
}

const emptyTally = (): Tally => ({ points: 0, possible: 0, answered: 0, unanswered: 0, na: 0 });

function addTally(into: Tally, from: Tally): void {
  into.points += from.points;
  into.possible += from.possible;
  into.answered += from.answered;
  into.unanswered += from.unanswered;
  into.na += from.na;
}

const ratioOf = (t: Tally): number | null => (t.possible === 0 ? null : t.points / t.possible);

export function bandFor(ratio: number): Band {
  const pct = Math.round(ratio * 100);
  if (pct >= 90) return 'compliant';
  if (pct >= 80) return 'mostly';
  if (pct >= 70) return 'moderately';
  if (pct >= 60) return 'minimally';
  return 'non';
}

export function scoreAudit(results: ReadonlyMap<string, Result | undefined>, c: Checklist = checklist): AuditScore {
  let negatives = 0;
  let unanswered = 0;

  const sections: SectionScore[] = c.sections.map((section) => {
    const sectionTally = emptyTally();
    const subsections: SubsectionScore[] = section.subsections.map((sub) => {
      const tally = emptyTally();
      for (const item of sub.items) {
        const result = results.get(item.id);
        const { points, possible } = itemPoints(item.weight, result);
        tally.points += points;
        tally.possible += possible;
        if (result === undefined) tally.unanswered += 1;
        else if (result === 'na') tally.na += 1;
        else tally.answered += 1;
        if (result === 'no' || result === 'partial') negatives += 1;
      }
      addTally(sectionTally, tally);
      return { id: sub.id, title: sub.title, tally, ratio: ratioOf(tally) };
    });
    unanswered += sectionTally.unanswered;
    return { id: section.id, title: section.title, tally: sectionTally, ratio: ratioOf(sectionTally), subsections };
  });

  const defined = sections.map((s) => s.ratio).filter((r): r is number => r !== null);
  const overall = defined.length === 0 ? null : defined.reduce((a, b) => a + b, 0) / defined.length;

  return { sections, overall, band: overall === null ? null : bandFor(overall), unanswered, negatives };
}
