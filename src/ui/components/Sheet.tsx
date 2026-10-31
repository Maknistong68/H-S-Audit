import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EXIT_MS = 150;

/**
 * Bottom sheet. Opens with a slide-up, closes with a short slide-down; Escape and the Close button act
 * immediately (the exit animation only follows). Focus is trapped while open and restored on close.
 */
export function Sheet(props: { open: boolean; title: string; onClose(): void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const [mounted, setMounted] = useState(props.open);
  const [closing, setClosing] = useState(false);

  // Keep rendering for the exit animation after `open` turns false.
  useEffect(() => {
    if (props.open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setMounted(false);
      return;
    }
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

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

  if (!mounted) return null;
  // Rendered at the end of <body> so no row, panel or sticky header can paint over it.
  return createPortal(
    <div class={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={props.onClose}>
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        aria-hidden={closing ? 'true' : undefined}
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="sheet-handle" aria-hidden="true" />
        <div class="sheet-head">
          <h2>{props.title}</h2>
          <button type="button" class="btn btn-quiet btn-sm" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>,
    document.body,
  );
}
