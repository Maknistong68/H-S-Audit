import type { Tag } from '../../db/db';

/** Read-only tag chips for one item. */
export function TagChips({ tagIds, tags }: { tagIds: string[]; tags: Tag[] }) {
  const byId = new Map(tags.map((t) => [t.id, t.label]));
  if (tagIds.length === 0) return <span class="muted">No tags</span>;
  return (
    <ul class="tag-chips" aria-label="Tags">
      {tagIds.map((id) => (
        <li key={id} class="tag-chip-static">
          {byId.get(id) ?? id}
        </li>
      ))}
    </ul>
  );
}
