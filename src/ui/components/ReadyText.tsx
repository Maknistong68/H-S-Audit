import { useState } from 'preact/hooks';
import { readyTextFor } from '../../data/readyText';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { toast } from './toast';

/**
 * One compact button that drops down the question's ready-made findings. Picking one adds it to the note,
 * where it can be edited or combined with another.
 */
export function ReadyText({ itemId, onPick }: { itemId: string; onPick(text: string): void }) {
  const [open, setOpen] = useState(false);
  const texts = readyTextFor(itemId);
  if (texts.length === 0) return null;
  return (
    <>
      <button type="button" class="icon-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon name="text" />
        <span class="caption">Ready text</span>
      </button>
      <Sheet open={open} title={`Ready text for ${itemId}`} onClose={() => setOpen(false)}>
        <p class="muted small">Tap a finding to add it to the note. Pick more than one to combine them, then edit as needed.</p>
        <ul class="ready-list">
          {texts.map((t, i) => (
            <li key={i}>
              <button
                type="button"
                class="ready-option"
                onClick={() => {
                  onPick(t);
                  setOpen(false);
                  toast('Added to the note');
                }}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
