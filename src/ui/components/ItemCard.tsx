import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Answer } from '../../db/db';
import { appendText } from '../../domain/text';
import type { ChecklistItem, Result } from '../../domain/types';
import { Icon } from './icons';
import { NoteField, type NoteFieldHandle } from './NoteField';
import { ResultControl, RESULT_OPTIONS } from './ResultControl';
import { ReadyText } from './ReadyText';

export interface ItemCardProps {
  auditId: string;
  item: ChecklistItem;
  answer?: Answer;
  expanded: boolean;
  mediaCounts?: { photos: number; audio: number };
  onToggle(): void;
  onResult(r: Result | undefined): void;
  onNote(note: string): Promise<void>;
  onFlag(flagged: boolean): void;
  onRepeated(repeated: boolean): void;
  onNext(): void;
  onPrev(): void;
  onNextUnanswered(): void;
  /** Photo / dictate controls, rendered in the tool row. */
  media?: ComponentChildren;
  /** Thumbnails (and memos from older audits), rendered under the tool row. */
  mediaStrip?: ComponentChildren;
  /** Interim dictation text shown under the note. */
  interim?: string;
  noteRef?: (h: NoteFieldHandle | null) => void;
  /** DOM id; the desk layout renders the same item twice (list and detail). */
  domId?: string;
}

const resultLabel = (r?: Result) => RESULT_OPTIONS.find((o) => o.value === r)?.label;

/** One question: a plain row that unfolds in place. Colour appears only on the status mark and the chosen result. */
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

  // Ready text lands in the open note; if the note is still closed, open it and save straight to the answer.
  const insertText = (text: string) => {
    if (noteHandle.current) {
      noteHandle.current.append(text);
    } else {
      setNoteOpen(true);
      void props.onNote(appendText(note, text));
    }
  };

  const setResult = (r: Result | undefined) => {
    props.onResult(r);
    if (r === 'no' || r === 'partial') {
      focusNote.current = true;
      setNoteOpen(true);
    }
  };

  const firstLine = note.split('\n')[0];
  const counts = props.mediaCounts ?? { photos: 0, audio: 0 };
  const descriptionId = `${props.domId ?? 'item'}-desc-${item.id}`;
  const previewBits = [
    firstLine,
    counts.photos > 0 ? `${counts.photos} photo${counts.photos > 1 ? 's' : ''}` : '',
    counts.audio > 0 ? `${counts.audio} memo${counts.audio > 1 ? 's' : ''}` : '',
  ].filter(Boolean);

  return (
    <article id={props.domId ?? `item-${item.id}`} class={`row${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        class="row-head"
        aria-expanded={expanded}
        aria-label={`${item.id} ${item.text}`}
        aria-describedby={descriptionId}
        onClick={props.onToggle}
      >
        <span class="row-id">{item.id}</span>
        <span class="row-main">
          <span class="row-q">{item.text}</span>
          {!expanded && negative && !note.trim() && <span class="row-needs">Note needed</span>}
          {!expanded && previewBits.length > 0 && <span class="row-preview">{previewBits.join('   ')}</span>}
        </span>
        <span class="row-status" id={descriptionId}>
          {answer?.flagged && (
            <>
              <Icon name="flag" size={16} class="row-flag" />
              <span class="visually-hidden">flagged, </span>
            </>
          )}
          <i key={result ?? 'none'} class={`dot${result ? ` dot-${result}` : ''}`} aria-hidden="true" />
          <span class={`status-word${result ? ` is-${result}` : ''}`}>{resultLabel(result) ?? ''}</span>
          {answer?.repeated && <span class="visually-hidden">, repeated</span>}
        </span>
      </button>

      {expanded && (
        <div class="row-body">
          <div class="row-body-inner">
            <div class="kv row-kv">
              <span>
                <b>Weight</b> {item.weight}
              </span>
            </div>

            <ResultControl value={result} onChange={setResult} />

            {noteOpen ? (
              <NoteField
                id={`${props.auditId}:${item.id}`}
                value={note}
                onSave={props.onNote}
                interim={props.interim}
                ref={(h: NoteFieldHandle | null) => {
                  noteHandle.current = h;
                  props.noteRef?.(h);
                }}
              />
            ) : (
              <button
                type="button"
                class="btn btn-quiet self-start"
                onClick={() => {
                  focusNote.current = true;
                  setNoteOpen(true);
                }}
              >
                <Icon name="plus" size={18} />
                Add note
              </button>
            )}

            <div class="tool-row" role="toolbar" aria-label="Item tools">
              <ReadyText itemId={item.id} onPick={insertText} />
              {props.media}
              <button type="button" class="icon-btn" aria-pressed={!!answer?.flagged} onClick={() => props.onFlag(!answer?.flagged)}>
                <Icon name="flag" />
                <span class="caption">Flag</span>
              </button>
              <button type="button" class="icon-btn" aria-pressed={!!answer?.repeated} onClick={() => props.onRepeated(!answer?.repeated)}>
                <Icon name="repeat" />
                <span class="caption">Repeated</span>
              </button>
            </div>

            {props.mediaStrip}

            <div class="row-footer">
              <button type="button" class="icon-btn" aria-label="Previous" onClick={props.onPrev}>
                <Icon name="chevron-left" />
              </button>
              <button type="button" class="icon-btn" aria-label="Next" onClick={props.onNext}>
                <Icon name="chevron-right" />
              </button>
              <button type="button" class="btn btn-primary" onClick={props.onNextUnanswered}>
                Next unanswered
                <Icon name="next" size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
