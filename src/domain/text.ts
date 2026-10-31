/** Appends `text` to `note` with a single separating space (none after a trailing newline). */
export function joinText(note: string, text: string): string {
  const t = text.trim();
  if (!t) return note;
  if (!note) return t;
  return /\s$/.test(note) ? note + t : `${note} ${t}`;
}
