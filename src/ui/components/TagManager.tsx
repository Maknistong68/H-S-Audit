import { useState } from 'preact/hooks';
import type { Tag } from '../../db/db';
import { repo } from '../../db/repo';
import { toast } from './toast';

function TagRow({ tag }: { tag: Tag }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tag.label);

  async function save() {
    const next = label.trim();
    if (!next) return;
    await repo.renameTag(tag.id, next);
    setEditing(false);
  }

  return (
    <li class="tag-manager-row">
      {editing ? (
        <form class="tag-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div class="field">
            <label for={`rename-${tag.id}`}>Rename {tag.label}</label>
            <input id={`rename-${tag.id}`} value={label} onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
          </div>
          <button type="submit" class="btn btn-sm btn-primary">Save name</button>
          <button type="button" class="btn btn-sm btn-ghost" onClick={() => { setLabel(tag.label); setEditing(false); }}>Cancel</button>
        </form>
      ) : (
        <>
          <span>
            {tag.label}
            {!tag.builtIn && <span class="chip">custom</span>}
          </span>
          <button type="button" class="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            Rename
          </button>
        </>
      )}
    </li>
  );
}

export function TagManager({ tags }: { tags: Tag[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  async function add() {
    const label = name.trim();
    if (!label) return;
    try {
      await repo.addTag(label);
      toast(`Tag "${label}" added`);
      setName('');
      setAdding(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add the tag');
    }
  }

  return (
    <section class="findings-section">
      <div class="section-head">
        <h2>Tags</h2>
        <button type="button" class="btn btn-sm" onClick={() => setAdding(true)} aria-expanded={adding}>
          Add tag
        </button>
      </div>
      <p class="muted small">Areas you can walk by. Questions get tags from the Tags button on each card.</p>
      {adding && (
        <form class="tag-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <div class="field">
            <label for="new-tag">Tag name</label>
            <input id="new-tag" value={name} autocomplete="off" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
          </div>
          <button type="submit" class="btn btn-sm btn-primary">Save tag</button>
          <button type="button" class="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}
      <ul class="list tag-manager">
        {tags.map((t) => (
          <TagRow key={t.id} tag={t} />
        ))}
      </ul>
    </section>
  );
}
