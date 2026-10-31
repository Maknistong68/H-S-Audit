import { useRef, useState } from 'preact/hooks';
import type { MediaOwner } from '../../db/db';
import { repo } from '../../db/repo';
import { processPhoto, UnsupportedPhotoError } from '../../media/photo';
import { PHOTO_COPIES_SETTING, photoCopyFilename } from '../../media/photoCopy';
import { downloadBytes } from '../download';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { Icon } from './icons';
import { toast } from './toast';

/**
 * Opens the phone's photo chooser (camera or gallery), shrinks each photo, stores it — and, unless turned off
 * in Settings, also drops a copy into the phone's Downloads so a photo is never only inside the app.
 */
export function PhotoButton({ auditId, auditNo, owner }: { auditId: string; auditNo: string; owner: MediaOwner }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const copies = useLiveQuery(() => repo.getSetting(PHOTO_COPIES_SETTING, true), []) ?? true;

  async function onChange(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    if (files.length === 0) return;
    setBusy(true);
    let saved = 0;
    for (const file of files) {
      try {
        const p = await processPhoto(file);
        await repo.addMedia({ auditId, owner, type: 'photo', data: p.data, mime: p.mime, width: p.width, height: p.height, thumb: p.thumb });
        saved += 1;
        if (copies) downloadBytes(new Uint8Array(p.data), photoCopyFilename(auditNo, owner, new Date()), 'image/jpeg');
      } catch (err) {
        toast(err instanceof UnsupportedPhotoError ? err.message : 'Could not save that photo — try again', { durationMs: 6000 });
      }
    }
    setBusy(false);
    if (files.length > 1 && saved > 0) toast(`${saved} photo${saved > 1 ? 's' : ''} added`);
  }

  return (
    <>
      <button type="button" class="icon-btn" disabled={busy} onClick={() => input.current?.click()}>
        <Icon name="camera" />
        <span class="caption">{busy ? 'Saving' : 'Photo'}</span>
      </button>
      <input ref={input} type="file" accept="image/*" multiple class="visually-hidden" aria-label="Add photo" onChange={onChange} />
    </>
  );
}
