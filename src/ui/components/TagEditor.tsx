import { useEffect, useState } from 'preact/hooks';
import type { Tag } from '../../db/db';
import { repo } from '../../db/repo';
import { paths } from '../paths';
import { Sheet } from './Sheet';

export function TagEditor(props: { open: boolean; itemId: string; selected: string[]; tags: Tag[]; onClose(): void }) {
  const [selected, setSelected] = useState<string[]>(props.selected);
  useEffect(() => {
    if (props.open) setSelected(props.selected);
  }, [props.open, props.selected]);

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...selected, id] : selected.filter((t) => t !== id);
    setSelected(next);
    void repo.setItemTags(props.itemId, next);
  };

  return (
    <Sheet open={props.open} title={`Tags for ${props.itemId}`} onClose={props.onClose}>
      <ul class="check-list">
        {props.tags.map((t) => (
          <li key={t.id}>
            <label class="check-row">
              <input type="checkbox" checked={selected.includes(t.id)} onChange={(e) => toggle(t.id, (e.currentTarget as HTMLInputElement).checked)} />
              <span>{t.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p class="muted">
        Tags apply to this question on every audit. Add new tags in <a href={paths.settings()}>Settings</a>.
      </p>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" onClick={props.onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
