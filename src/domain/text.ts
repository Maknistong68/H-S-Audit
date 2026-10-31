/** "PROCESS AND PROCEDURES (ASSESSED ON SITE)" → "Process and procedures (assessed on site)". */
export function sentenceCase(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Appends a sentence or more to a note: a single separating space (none after whitespace), and a capital
 * first letter when the note is empty or its last sentence has ended.
 */
export function appendText(note: string, text: string): string {
  const t = text.trim();
  if (!t) return note;
  const startsSentence = note.trim() === '' || /[.!?]\s*$/.test(note) || /\n\s*$/.test(note);
  const piece = startsSentence ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  return joinText(note, piece);
}

/** Appends `text` to `note` with a single separating space (none after a trailing newline). */
export function joinText(note: string, text: string): string {
  const t = text.trim();
  if (!t) return note;
  if (!note) return t;
  return /\s$/.test(note) ? note + t : `${note} ${t}`;
}
