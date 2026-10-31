import a from './observations/A.json';
import b from './observations/B.json';
import c from './observations/C.json';

const TEXTS: Record<string, string[]> = { ...a, ...b, ...c };

/** Ready-made findings (No / Partial) for a question; at least five each. */
export function readyTextFor(itemId: string): string[] {
  return TEXTS[itemId] ?? [];
}
