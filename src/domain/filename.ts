import type { Audit } from '../db/db';

/** Keeps `[A-Za-z0-9._-]`, collapses everything else to `-`, trims; falls back when nothing is left. */
export function safeName(s: string, fallback: string): string {
  const cleaned = s
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || fallback;
}

export function excelFilename(audit: Audit): string {
  return `${safeName(audit.header.auditNo, 'audit')}-HS-Audit-${safeName(audit.header.auditDate, 'undated')}.xlsx`;
}

export function backupFilename(audit: Audit): string {
  return `${safeName(audit.header.auditNo, 'audit')}-backup.zip`;
}
