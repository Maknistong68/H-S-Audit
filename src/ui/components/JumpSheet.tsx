import { checklist } from '../../data/checklist';
import type { Answer } from '../../db/db';
import { Sheet } from './Sheet';

export function JumpSheet(props: { open: boolean; answers: ReadonlyMap<string, Answer>; onJump(firstItemId: string): void; onClose(): void }) {
  const done = (ids: string[]) => ids.filter((id) => props.answers.get(id)?.result !== undefined).length;
  return (
    <Sheet open={props.open} title="Jump to section" onClose={props.onClose}>
      <ul class="jump-list">
        {checklist.sections.map((section) => (
          <li key={section.id}>
            <div class="jump-section">
              {section.id} · {section.title}
            </div>
            <ul class="jump-subs">
              {section.subsections.map((sub) => {
                const ids = sub.items.map((i) => i.id);
                return (
                  <li key={sub.id}>
                    <button type="button" class="jump-btn" onClick={() => props.onJump(ids[0])}>
                      <span>{sub.implicit ? 'All questions' : `${sub.id} · ${sub.title}`}</span>
                      <span class="muted">
                        {done(ids)}/{ids.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
