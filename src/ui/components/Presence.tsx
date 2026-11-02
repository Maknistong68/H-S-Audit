import type { PresenceState } from '../../server/remote';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

/** Everyone else in the open audit, as initials; the full names are in the accessible label and on hover. */
export function Presence({ others }: { others: PresenceState[] }) {
  if (others.length === 0) return null;
  const shown = others.slice(0, 4);
  const names = others.map((p) => p.name).join(', ');
  return (
    <div class="presence" aria-label={`Also in this audit: ${names}`} title={names}>
      {shown.map((p) => (
        <span key={p.userId} class="presence-chip">
          {initials(p.name)}
        </span>
      ))}
      {others.length > shown.length && <span class="presence-chip presence-more">+{others.length - shown.length}</span>}
    </div>
  );
}
