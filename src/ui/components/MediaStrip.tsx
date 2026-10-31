import { useState } from 'preact/hooks';
import type { Media } from '../../db/db';
import { repo } from '../../db/repo';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { formatClock } from './MemoButton';
import { Sheet } from './Sheet';
import { toast } from './toast';

function Thumb({ media, index, onOpen }: { media: Media; index: number; onOpen(): void }) {
  const url = useObjectUrl(media.thumb ?? media.data, media.mime);
  return (
    <button type="button" class="thumb" onClick={onOpen}>
      {url && <img src={url} alt={`Photo ${index}`} width={media.width} height={media.height} />}
    </button>
  );
}

function FullPhoto({ media, index }: { media: Media; index: number }) {
  const url = useObjectUrl(media.data, media.mime);
  return url ? <img class="photo-full" src={url} alt={`Photo ${index}, full size`} /> : null;
}

function AudioRow({ media, index, onRemove }: { media: Media; index: number; onRemove(): void }) {
  const url = useObjectUrl(media.data, media.mime);
  return (
    <div class="audio-row">
      <audio controls src={url} preload="metadata" aria-label={`Memo ${index}`} />
      <span class="muted">{media.durationMs ? formatClock(media.durationMs) : ''}</span>
      <button type="button" class="btn btn-sm btn-ghost" aria-label={`Remove memo ${index}`} onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function remove(m: Media, what: string) {
  void repo.softDeleteMedia(m.id).then(() =>
    toast(`${what} removed`, { action: { label: 'Undo', onClick: () => void repo.restoreMedia(m.id) }, durationMs: 8000 }),
  );
}

/** Photos and memos attached to one item or positive observation. */
export function MediaStrip({ media }: { media: Media[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const photos = media.filter((m) => m.type === 'photo');
  const audio = media.filter((m) => m.type === 'audio');
  if (media.length === 0) return null;
  const openPhoto = open === null ? null : photos[open];
  return (
    <div class="media-strip">
      {photos.length > 0 && (
        <ul class="photo-grid" aria-label="Photos">
          {photos.map((m, i) => (
            <li key={m.id}>
              <Thumb media={m} index={i + 1} onOpen={() => setOpen(i)} />
              <button type="button" class="thumb-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(m, 'Photo')}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {audio.map((m, i) => (
        <AudioRow key={m.id} media={m} index={i + 1} onRemove={() => remove(m, 'Memo')} />
      ))}
      <Sheet open={openPhoto !== undefined && openPhoto !== null} title={`Photo ${(open ?? 0) + 1} of ${photos.length}`} onClose={() => setOpen(null)}>
        {openPhoto && <FullPhoto media={openPhoto} index={(open ?? 0) + 1} />}
      </Sheet>
    </div>
  );
}
