import type { Tag } from '../../db/db';

/** The item's tags as plain text, one element per tag. */
export function TagText({ tagIds, tags }: { tagIds: string[]; tags: Tag[] }) {
  const byId = new Map(tags.map((t) => [t.id, t.label]));
  if (tagIds.length === 0) return <span class="muted">No tags</span>;
  return (
    <span class="tag-text" aria-label="Tags">
      {tagIds.map((id, i) => (
        <span key={id}>
          {i > 0 && <span class="tag-sep">, </span>}
          <span>{byId.get(id) ?? id}</span>
        </span>
      ))}
    </span>
  );
}
