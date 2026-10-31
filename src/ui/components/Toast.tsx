import { useEffect, useRef, useState } from 'preact/hooks';
import { dismissToast, subscribeToasts, type ToastItem } from './toast';

const EXIT_MS = 150;

/** Toast host: new toasts rise in; dismissed ones fade out before leaving the DOM. */
export function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [leaving, setLeaving] = useState<Set<number>>(new Set());
  const shown = useRef<ToastItem[]>([]);

  useEffect(
    () =>
      subscribeToasts((next) => {
        const nextIds = new Set(next.map((t) => t.id));
        const gone = shown.current.filter((t) => !nextIds.has(t.id));
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (gone.length > 0 && !reduced) {
          setLeaving((s) => new Set([...s, ...gone.map((t) => t.id)]));
          setTimeout(() => {
            shown.current = shown.current.filter((t) => !gone.some((g) => g.id === t.id));
            setItems([...shown.current]);
            setLeaving((s) => {
              const copy = new Set(s);
              for (const g of gone) copy.delete(g.id);
              return copy;
            });
          }, EXIT_MS);
          shown.current = [...shown.current.filter((t) => nextIds.has(t.id) || gone.some((g) => g.id === t.id)), ...next.filter((t) => !shown.current.some((s) => s.id === t.id))];
        } else {
          shown.current = next;
        }
        setItems([...shown.current]);
      }),
    [],
  );

  if (items.length === 0) return null;
  return (
    <div class="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div class={`toast${leaving.has(t.id) ? ' leaving' : ''}`} key={t.id}>
          <span class="toast-message">{t.message}</span>
          {t.action && (
            <button
              type="button"
              class="btn btn-sm btn-toast"
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" class="toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
