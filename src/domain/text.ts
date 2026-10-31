/** "PROCESS AND PROCEDURES (ASSESSED ON SITE)" → "Process and procedures (assessed on site)". */
export function sentenceCase(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Appends `text` to `note` with a single separating space (none after a trailing newline). */
export function joinText(note: string, text: string): string {
  const t = text.trim();
  if (!t) return note;
  if (!note) return t;
  return /\s$/.test(note) ? note + t : `${note} ${t}`;
}
