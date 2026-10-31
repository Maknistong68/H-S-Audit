import { allItems, checklist } from '../data/checklist';
import type { Answer, Audit, AuditHeader } from '../db/db';
import type { Checklist } from '../domain/types';

export interface PreflightIssue {
  kind: 'unanswered' | 'no-note' | 'header';
  /** Item id, or header field name. */
  ref: string;
  label: string;
}

export const HEADER_LABELS: Record<keyof AuditHeader, string> = {
  contractorWo: 'Contractor / WO',
  projectName: 'Project name',
  auditors: 'Auditors',
  auditDate: 'Audit date',
  auditNo: 'Audit no',
  contactNumber: 'Contact number',
};

/** What is still missing before the report is complete; the auditor may export anyway. */
export function preflight(audit: Audit, answers: ReadonlyMap<string, Answer>, c: Checklist = checklist): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const item of allItems(c)) {
    const a = answers.get(item.id);
    if (a?.result === undefined) issues.push({ kind: 'unanswered', ref: item.id, label: item.id });
    else if ((a.result === 'no' || a.result === 'partial') && !a.note.trim()) issues.push({ kind: 'no-note', ref: item.id, label: item.id });
  }
  for (const key of Object.keys(HEADER_LABELS) as (keyof AuditHeader)[]) {
    if (!(audit.header[key] ?? '').trim()) issues.push({ kind: 'header', ref: key, label: HEADER_LABELS[key] });
  }
  return issues;
}
