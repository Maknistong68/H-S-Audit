import { useEffect, useState } from 'preact/hooks';
import { dismissToast, subscribeToasts, type ToastItem } from './toast';

export function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  if (items.length === 0) return null;
  return (
    <div class="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div class="toast" key={t.id}>
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
