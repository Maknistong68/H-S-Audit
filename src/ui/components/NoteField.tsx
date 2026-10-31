import { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useRef, useState } from 'preact/hooks';
import { flushPendingWrites, hasPendingWrite, schedulePendingWrite } from '../../db/flush';

export interface NoteFieldHandle {
  focus(): void;
  /** Appends dictated text and saves. */
  append(text: string): void;
}

interface Props {
  id: string;
  value: string;
  onSave(value: string): Promise<void>;
  interim?: string;
  label?: string;
  placeholder?: string;
}

/**
 * Auto-growing note with debounced write-through: every change is saved 300 ms after the last keystroke,
 * on unmount, and whenever the page is hidden (see db/flush.ts).
 */
export const NoteField = forwardRef<NoteFieldHandle, Props>(function NoteField(props, ref) {
  const [local, setLocal] = useState(props.value);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const key = `note:${props.id}`;

  // Take the stored value when it changes underneath us (snapshot restore), but never while a write is pending
  // or the auditor is typing.
  useEffect(() => {
    if (hasPendingWrite(key) || document.activeElement === textarea.current) return;
    setLocal(props.value);
  }, [props.value, key]);

  useEffect(() => {
    return () => {
      void flushPendingWrites();
    };
  }, []);

  const save = (next: string) => {
    setLocal(next);
    schedulePendingWrite(key, () => props.onSave(next));
  };

  useImperativeHandle(ref, () => ({
    focus: () => textarea.current?.focus(),
    append: (text: string) => {
      const current = textarea.current?.value ?? local;
      const t = text.trim();
      if (!t) return;
      const next = !current ? t : /\s$/.test(current) ? current + t : `${current} ${t}`;
      save(next);
    },
  }));

  const rows = Math.min(10, Math.max(3, local.split('\n').length + 1));
  return (
    <div class="field note-field">
      <label for={`note-${props.id}`}>{props.label ?? 'Observation note'}</label>
      <textarea
        id={`note-${props.id}`}
        ref={textarea}
        rows={rows}
        value={local}
        placeholder={props.placeholder ?? 'What was seen, where, and the evidence'}
        onInput={(e) => save((e.currentTarget as HTMLTextAreaElement).value)}
      />
      {props.interim && (
        <p class="note-interim" aria-live="polite">
          {props.interim}
        </p>
      )}
    </div>
  );
});
