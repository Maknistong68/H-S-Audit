import { useState } from 'preact/hooks';
import type { Media, MediaRow } from '../../db/db';
import { repo } from '../../db/repo';
import { photoCopyFilename } from '../../media/photoCopy';
import { saveOrShare } from '../download';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { formatClock } from './MemoButton';
import { Sheet } from './Sheet';
import { toast } from './toast';

/** Bytes are loaded only for what is on screen: a full-size photo or a memo player. */
function useMediaBytes(id: string): Media | undefined {
  return useLiveQuery(() => repo.getMedia(id), [id]);
}

function Thumb({ media, index, onOpen }: { media: MediaRow; index: number; onOpen(): void }) {
  const url = useObjectUrl(media.thumb, media.mime);
  return (
    <button type="button" class="thumb" onClick={onOpen}>
      {url && <img src={url} alt={`Photo ${index}`} width={media.width} height={media.height} />}
    </button>
  );
}

function FullPhoto({ media, index }: { media: MediaRow; index: number }) {
  const full = useMediaBytes(media.id);
  const url = useObjectUrl(full?.data, media.mime);
  return url ? <img class="photo-full" src={url} alt={`Photo ${index}, full size`} /> : <p class="muted">Loading photo…</p>;
}

function AudioRow({ media, index, onRemove }: { media: MediaRow; index: number; onRemove(): void }) {
  const full = useMediaBytes(media.id);
  const url = useObjectUrl(full?.data, media.mime);
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

function remove(m: MediaRow, what: string) {
  void repo.softDeleteMedia(m.id).then(() =>
    toast(`${what} removed`, { action: { label: 'Undo', onClick: () => void repo.restoreMedia(m.id) }, durationMs: 8000 }),
  );
}

/** Share sheet (Save Image on iPhone, Teams/WhatsApp anywhere) or a plain download of the full-size photo. */
async function share(m: MediaRow, auditNo: string) {
  const full = await repo.getMedia(m.id);
  if (!full) {
    toast('That photo is no longer on this device');
    return;
  }
  const how = await saveOrShare(new Uint8Array(full.data), photoCopyFilename(auditNo, m.owner, new Date(m.createdAt)), 'image/jpeg');
  if (how === 'downloaded') toast('Photo saved to Downloads');
}

/** Photos and memos attached to one item or positive observation. */
export function MediaStrip({ media, auditNo }: { media: MediaRow[]; auditNo: string }) {
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
              <button type="button" class="thumb-share" aria-label={`Share photo ${i + 1}`} onClick={() => void share(m, auditNo)}>
                Share
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
        {openPhoto && (
          <div class="actions-row">
            <button type="button" class="btn" onClick={() => void share(openPhoto, auditNo)}>
              Share / save to Photos
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
