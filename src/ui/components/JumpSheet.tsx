import { checklist } from '../../data/checklist';
import type { Answer } from '../../db/db';
import { sentenceCase } from '../../domain/text';
import { Sheet } from './Sheet';

export function JumpSheet(props: { open: boolean; answers: ReadonlyMap<string, Answer>; onJump(firstItemId: string): void; onClose(): void }) {
  const done = (ids: string[]) => ids.filter((id) => props.answers.get(id)?.result !== undefined).length;
  return (
    <Sheet open={props.open} title="Jump to section" onClose={props.onClose}>
      <ul class="jump-list">
        {checklist.sections.map((section) => (
          <li key={section.id}>
            <div class="jump-section">
              <span class="letter">{section.id}</span>
              <span>{sentenceCase(section.title)}</span>
            </div>
            <ul class="jump-subs">
              {section.subsections.map((sub) => {
                const ids = sub.items.map((i) => i.id);
                return (
                  <li key={sub.id}>
                    <button type="button" class="jump-btn" onClick={() => props.onJump(ids[0])}>
                      <span class="jump-id">{sub.implicit ? '' : sub.id}</span>
                      <span class="jump-title">{sub.implicit ? 'All questions' : sub.title}</span>
                      <span class="jump-count">
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
