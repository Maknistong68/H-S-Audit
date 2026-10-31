/**
 * Browser-only: combines up to four photos into one JPEG grid, because an Excel cell holds one picture.
 * One photo is passed through untouched. Each tile is cropped to fill a 4:3 frame.
 */
const TILE_W = 800;
const TILE_H = 600;
const GAP = 8;

export async function composePhotos(jpegs: Uint8Array[]): Promise<Uint8Array> {
  if (jpegs.length <= 1) return jpegs[0];
  const bitmaps = await Promise.all(jpegs.map((j) => createImageBitmap(new Blob([j as unknown as BlobPart], { type: 'image/jpeg' }))));
  const cols = 2;
  const rows = Math.ceil(bitmaps.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE_W + (cols - 1) * GAP;
  canvas.height = rows * TILE_H + (rows - 1) * GAP;
  const ctx = canvas.getContext('2d');
  if (!ctx) return jpegs[0];
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  bitmaps.forEach((bmp, i) => {
    const x = (i % cols) * (TILE_W + GAP);
    const y = Math.floor(i / cols) * (TILE_H + GAP);
    const scale = Math.max(TILE_W / bmp.width, TILE_H / bmp.height);
    const sw = TILE_W / scale;
    const sh = TILE_H / scale;
    ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, y, TILE_W, TILE_H);
    bmp.close?.();
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : jpegs[0];
}
