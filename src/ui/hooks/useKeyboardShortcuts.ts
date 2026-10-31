import { useEffect } from 'preact/hooks';
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

/** 1–4 set the result, j/k move, f flags. Ignored while typing or while a dialog is open. */
export function useKeyboardShortcuts(handlers: WalkShortcuts, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('[role="dialog"]')) return;
      const result = RESULT_KEYS[e.key];
      if (result) handlers.onResult(result);
      else if (e.key === 'j') handlers.onNext();
      else if (e.key === 'k') handlers.onPrev();
      else if (e.key === 'f') handlers.onFlag();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers, enabled]);
}
