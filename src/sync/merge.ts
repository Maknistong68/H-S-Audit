import type { Change, RemoteRow } from './types';

/**
 * Per-field last-write-wins, the same rule `hs_apply` runs on the server: a field is overwritten only when
 * the change is newer than that field's recorded timestamp. Pure; never mutates its inputs.
 */
export function applyChange(row: RemoteRow | undefined, change: Change, by: string): { row: RemoteRow; applied: string[]; skipped: string[] } {
  const next: RemoteRow = row ? { ...row, field_at: { ...row.field_at } } : { ...change.key, updated_at: 0, field_at: {} };
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const [field, value] of Object.entries(change.fields)) {
    if (field in change.key) continue; // keys are identity, never data
    const seen = next.field_at[field] ?? 0;
    if (change.at > seen) {
      next[field] = value;
      next.field_at[field] = change.at;
      applied.push(field);
    } else {
      skipped.push(field);
    }
  }
  if (applied.length > 0) {
    next.updated_at = Math.max(next.updated_at, change.at);
    next.updated_by = by;
  }
  return { row: next, applied, skipped };
}

/**
 * Merges a row that arrived from the server into the local copy: each field comes from whichever side has
 * the newer timestamp, then every pending local patch newer than that is re-applied so the phone shows what
 * the server will converge to once the patches land.
 */
export function mergeRows(local: RemoteRow | undefined, incoming: RemoteRow, pending: Change[]): RemoteRow {
  let merged: RemoteRow;
  if (!local) {
    merged = { ...incoming, field_at: { ...incoming.field_at } };
  } else {
    merged = { ...local, field_at: { ...local.field_at } };
    for (const field of Object.keys(incoming)) {
      if (field === 'field_at' || field === 'updated_at' || field === 'updated_by' || field === 'server_at') continue;
      const theirs = incoming.field_at[field];
      if (theirs === undefined) {
        // not a tracked field (a key column): the server's value is authoritative
        if (!(field in merged)) merged[field] = incoming[field];
        continue;
      }
      if (theirs > (merged.field_at[field] ?? 0)) {
        merged[field] = incoming[field];
        merged.field_at[field] = theirs;
      }
    }
    if (incoming.updated_at >= merged.updated_at) {
      merged.updated_at = incoming.updated_at;
      merged.updated_by = incoming.updated_by;
    }
    if (incoming.server_at !== undefined) merged.server_at = incoming.server_at;
  }
  for (const change of pending) {
    merged = applyChange(merged, change, String(merged.updated_by ?? '')).row;
  }
  return merged;
}

/** A timestamp for a new local write that can never lose to what this device has already seen for `fields`. */
export function nextAt(now: number, row: RemoteRow | undefined, fields: string[]): number {
  let at = now;
  for (const field of fields) {
    const seen = row?.field_at?.[field];
    if (seen !== undefined && seen >= at) at = seen + 1;
  }
  return at;
}
