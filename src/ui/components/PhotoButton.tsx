import { useRef, useState } from 'preact/hooks';
import type { MediaOwner } from '../../db/db';
import { repo } from '../../db/repo';
import { processPhoto, UnsupportedPhotoError } from '../../media/photo';
import { toast } from './toast';

/** Opens the phone's photo chooser (camera or gallery), shrinks each photo and stores it. */
export function PhotoButton({ auditId, owner }: { auditId: string; owner: MediaOwner }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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
      } catch (err) {
        toast(err instanceof UnsupportedPhotoError ? err.message : 'Could not save that photo — try again', { durationMs: 6000 });
      }
    }
    setBusy(false);
    if (files.length > 1 && saved > 0) toast(`${saved} photo${saved > 1 ? 's' : ''} added`);
  }

  return (
    <>
      <button type="button" class="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Saving…' : 'Photo'}
      </button>
      <input ref={input} type="file" accept="image/*" multiple class="visually-hidden" aria-label="Add photo" onChange={onChange} />
    </>
  );
}
