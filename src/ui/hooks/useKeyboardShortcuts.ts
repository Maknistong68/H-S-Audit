import { useEffect, useRef } from 'preact/hooks';
import type { Result } from '../../domain/types';

export interface WalkShortcuts {
  onResult(r: Result): void;
  onNext(): void;
  onPrev(): void;
  onFlag(): void;
}

const RESULT_KEYS: Record<string, Result> = { '1': 'full', '2': 'partial', '3': 'no', '4': 'na' };

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * 1–4 set the result, j/k move, f flags. Ignored while typing or while a dialog is open.
 * The listener is attached once and reads the latest handlers through a ref, so a key pressed right after
 * the selection changes acts on the item now shown, never on the previous one.
 */
export function useKeyboardShortcuts(handlers: WalkShortcuts, enabled = true): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('[role="dialog"]')) return;
      const result = RESULT_KEYS[e.key];
      if (result) latest.current.onResult(result);
      else if (e.key === 'j') latest.current.onNext();
      else if (e.key === 'k') latest.current.onPrev();
      else if (e.key === 'f') latest.current.onFlag();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
