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

  // Renaming happens in place: the input takes the label's spot and the row keeps its height, so nothing below moves.
  if (editing) {
    return (
      <li class="list-row tag-row">
        <form
          class="inline-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            class="inline-input"
            aria-label={`Rename ${tag.label}`}
            value={label}
            autoFocus
            onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setLabel(tag.label);
                setEditing(false);
              }
            }}
          />
          <button type="submit" class="btn btn-sm btn-primary">
            Save
          </button>
          <button
            type="button"
            class="btn btn-sm btn-quiet"
            onClick={() => {
              setLabel(tag.label);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      </li>
    );
  }
  return (
    <li class="list-row tag-row">
      <span class="list-row-main">
        <span>{tag.label}</span>
        {!tag.builtIn && <span class="list-row-meta">Custom tag</span>}
      </span>
      <button type="button" class="btn btn-sm btn-quiet" onClick={() => setEditing(true)}>
        Rename
      </button>
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
    <section class="panel">
      <div class="panel-head">
        <h2>Tags</h2>
        <button type="button" class="btn btn-sm" onClick={() => setAdding(true)} aria-expanded={adding}>
          Add tag
        </button>
      </div>
      {adding && (
        <form
          class="tag-form panel-body"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div class="field">
            <label for="new-tag">Tag name</label>
            <input id="new-tag" value={name} autocomplete="off" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
          </div>
          <div class="actions-row">
            <button type="submit" class="btn btn-sm btn-primary">
              Save tag
            </button>
            <button type="button" class="btn btn-sm btn-quiet" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <ul class="rows">
        {tags.map((t) => (
          <TagRow key={t.id} tag={t} />
        ))}
      </ul>
      <p class="panel-note">Areas you can walk by. Questions get their tags from the Tags button on each question.</p>
    </section>
  );
}
