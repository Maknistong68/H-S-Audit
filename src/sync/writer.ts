import type { Role } from '../db/db';

/** Who is making local writes: the signed-in account and its role. Null before any sign-in (imports, tests). */
export interface Writer {
  id: string;
  role: Role | null;
}

export class ReadOnlyError extends Error {
  constructor() {
    super('This account can view audits but not edit them');
    this.name = 'ReadOnlyError';
  }
}

let current: Writer | null = null;

export function setWriter(w: Writer | null): void {
  current = w;
}

export function getWriter(): Writer | null {
  return current;
}

export const canEdit = (role: Role | null | undefined): boolean => role === 'auditor' || role === 'lead' || role === 'admin';

export const isAdmin = (role: Role | null | undefined): boolean => role === 'admin';
