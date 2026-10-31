import type { MediaOwner } from './db';

export function newId(): string {
  return crypto.randomUUID();
}

export function answerId(auditId: string, itemId: string): string {
  return `${auditId}:${itemId}`;
}

/** Stable key for grouping media by what it belongs to: `item:<itemId>` or `positive:<positiveId>`. */
export function ownerKey(owner: MediaOwner): string {
  return owner.kind === 'item' ? `item:${owner.itemId}` : `positive:${owner.positiveId}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
