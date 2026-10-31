import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet(props: { open: boolean; title: string; onClose(): void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!props.open) return;
    restoreTo.current = document.activeElement;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
        return;
      }
      if (e.key === 'Tab' && el) {
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const firstNode = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === firstNode) {
          e.preventDefault();
          lastNode.focus();
        } else if (!e.shiftKey && document.activeElement === lastNode) {
          e.preventDefault();
          firstNode.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      (restoreTo.current as HTMLElement | null)?.focus?.();
    };
  }, [props.open]);

  if (!props.open) return null;
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="sheet-head">
          <h2>{props.title}</h2>
          <button type="button" class="btn btn-ghost btn-sm" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}
