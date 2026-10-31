import type { MediaOwner } from '../db/db';
import { safeName } from '../domain/filename';

const two = (n: number) => String(n).padStart(2, '0');

/** `HSSEW-004_B9-1_20261031-143205.jpg`: readable in a gallery, sortable, no characters a phone rejects. */
export function photoCopyFilename(auditNo: string, owner: MediaOwner, at: Date): string {
  const stamp = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  const what = owner.kind === 'item' ? owner.itemId.replace(/\./g, '-') : 'positive';
  return `${safeName(auditNo, 'audit')}_${what}_${stamp}.jpg`;
}

/** Setting key: also drop every in-app photo into the phone's Downloads (gallery on Android). */
export const PHOTO_COPIES_SETTING = 'photoCopies';
