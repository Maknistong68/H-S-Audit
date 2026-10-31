import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Answer, Tag } from '../../db/db';
import type { ChecklistItem, Result } from '../../domain/types';
import { NoteField, type NoteFieldHandle } from './NoteField';
import { ResultControl, RESULT_OPTIONS } from './ResultControl';
import { TagChips } from './TagChips';

export interface ItemCardProps {
  item: ChecklistItem;
  answer?: Answer;
  tagIds: string[];
  tags: Tag[];
  expanded: boolean;
  mediaCounts?: { photos: number; audio: number };
  onToggle(): void;
  onResult(r: Result | undefined): void;
  onNote(note: string): Promise<void>;
  onFlag(flagged: boolean): void;
  onRepeated(repeated: boolean): void;
  onEditTags(): void;
  onNext(): void;
  onPrev(): void;
  onNextUnanswered(): void;
  /** Photo / memo / dictate controls, rendered in the toolbar. */
  media?: ComponentChildren;
  /** Thumbnails and memos, rendered under the toolbar. */
  mediaStrip?: ComponentChildren;
  /** Interim dictation text shown under the note. */
  interim?: string;
  noteRef?: (h: NoteFieldHandle | null) => void;
}

const resultLabel = (r?: Result) => RESULT_OPTIONS.find((o) => o.value === r)?.label;

export function ItemCard(props: ItemCardProps) {
  const { item, answer, expanded } = props;
  const result = answer?.result;
  const note = answer?.note ?? '';
  const negative = result === 'no' || result === 'partial';
  const [noteOpen, setNoteOpen] = useState(negative || note.length > 0);
  const noteHandle = useRef<NoteFieldHandle | null>(null);
  const focusNote = useRef(false);

  useEffect(() => {
    if (negative || note.length > 0) setNoteOpen(true);
  }, [negative, note.length]);

  useEffect(() => {
    if (focusNote.current && noteOpen) {
      focusNote.current = false;
      requestAnimationFrame(() => noteHandle.current?.focus());
    }
  }, [noteOpen, result]);

  const setResult = (r: Result | undefined) => {
    props.onResult(r);
    if (r === 'no' || r === 'partial') {
      focusNote.current = true;
      setNoteOpen(true);
    }
  };

  const firstLine = note.split('\n')[0];
  const counts = props.mediaCounts ?? { photos: 0, audio: 0 };
  const descriptionId = `desc-${item.id}`;
  const description = [resultLabel(result) ?? 'Unanswered', answer?.flagged ? 'flagged' : '', answer?.repeated ? 'repeated' : '']
    .filter(Boolean)
    .join(', ');

  return (
    <article id={`item-${item.id}`} class={`item-card${expanded ? ' expanded' : ''}${result ? ` is-${result}` : ''}`}>
      <button
        type="button"
        class="item-head"
        aria-expanded={expanded}
        aria-label={`${item.id} ${item.text}`}
        aria-describedby={descriptionId}
        onClick={props.onToggle}
      >
        <span class="item-id">{item.id}</span>
        <span class="item-text">{item.text}</span>
        <span class="item-meta" id={descriptionId}>
          <span class="chip chip-weight" title="Weight">
            W{item.weight}
          </span>
          {result && <span class={`chip chip-result chip-${result}`}>{resultLabel(result)}</span>}
          {answer?.flagged && <span class="chip chip-flag">Flagged</span>}
          {answer?.repeated && <span class="chip chip-repeated">Repeated</span>}
          {counts.photos > 0 && <span class="chip">{counts.photos} photo{counts.photos > 1 ? 's' : ''}</span>}
          {counts.audio > 0 && <span class="chip">{counts.audio} memo{counts.audio > 1 ? 's' : ''}</span>}
        </span>
        {!expanded && firstLine && <span class="item-note-preview">{firstLine}</span>}
      </button>

      {expanded && (
        <div class="item-body">
          <ResultControl value={result} onChange={setResult} />

          {noteOpen ? (
            <NoteField
              id={`${answer?.auditId ?? 'audit'}:${item.id}`}
              value={note}
              onSave={props.onNote}
              interim={props.interim}
              ref={(h: NoteFieldHandle | null) => {
                noteHandle.current = h;
                props.noteRef?.(h);
              }}
            />
          ) : (
            <button type="button" class="btn btn-sm btn-ghost self-start" onClick={() => { focusNote.current = true; setNoteOpen(true); }}>
              Add note
            </button>
          )}

          <div class="item-toolbar" role="toolbar" aria-label="Item tools">
            {props.media}
            <button type="button" class="btn btn-sm" aria-pressed={!!answer?.flagged} onClick={() => props.onFlag(!answer?.flagged)}>
              Flag
            </button>
            <button type="button" class="btn btn-sm" aria-pressed={!!answer?.repeated} onClick={() => props.onRepeated(!answer?.repeated)}>
              Repeated
            </button>
            <button type="button" class="btn btn-sm" onClick={props.onEditTags}>
              Tags
            </button>
          </div>

          {props.mediaStrip}

          <TagChips tagIds={props.tagIds} tags={props.tags} />

          <div class="item-footer">
            <button type="button" class="btn btn-sm" onClick={props.onPrev}>
              Previous
            </button>
            <button type="button" class="btn btn-sm" onClick={props.onNext}>
              Next
            </button>
            <button type="button" class="btn btn-sm btn-primary" onClick={props.onNextUnanswered}>
              Next unanswered
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
