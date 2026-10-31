type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

/** Plain browser download: Downloads folder on Android (visible in the gallery), Files › Downloads on iOS. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Hands a file to the phone's share sheet when files can be shared; otherwise downloads it. */
export async function saveOrShare(bytes: Uint8Array, filename: string, mime: string): Promise<'shared' | 'downloaded'> {
  const file = new File([bytes as unknown as BlobPart], filename, { type: mime });
  const nav = navigator as ShareNavigator;
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      // A cancelled share sheet falls through to a plain download so the file is never lost.
      if ((err as DOMException)?.name !== 'AbortError') console.warn('share failed, downloading instead', err);
    }
  }
  downloadBytes(bytes, filename, mime);
  return 'downloaded';
}
