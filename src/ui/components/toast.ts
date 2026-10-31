export interface ToastAction {
  label: string;
  onClick(): void;
}

export interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
  /** 0 = stays until dismissed */
  durationMs: number;
}

type Listener = (items: ToastItem[]) => void;

const listeners = new Set<Listener>();
let items: ToastItem[] = [];
let seq = 0;

function emit(): void {
  for (const fn of listeners) fn(items);
}

export function toast(message: string, opts: { action?: ToastAction; durationMs?: number } = {}): number {
  const item: ToastItem = { id: ++seq, message, action: opts.action, durationMs: opts.durationMs ?? 4000 };
  items = [...items, item];
  emit();
  if (item.durationMs > 0) setTimeout(() => dismissToast(item.id), item.durationMs);
  return item.id;
}

export function dismissToast(id: number): void {
  if (!items.some((i) => i.id === id)) return;
  items = items.filter((i) => i.id !== id);
  emit();
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  fn(items);
  return () => {
    listeners.delete(fn);
  };
}
