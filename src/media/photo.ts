export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.8;
export const THUMB_MAX_EDGE = 200;
const THUMB_QUALITY = 0.7;

export class UnsupportedPhotoError extends Error {
  constructor() {
    super('Photo format not supported — use the camera');
    this.name = 'UnsupportedPhotoError';
  }
}

export interface ProcessedPhoto {
  data: ArrayBuffer;
  width: number;
  height: number;
  thumb: ArrayBuffer;
  mime: 'image/jpeg';
}

/** Scales (w, h) down so the longer edge is at most `maxEdge`; never upscales. */
export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function defaultDecode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older engines reject the options bag; they apply EXIF orientation themselves.
    return createImageBitmap(file);
  }
}

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not encode the photo');
  return blob.arrayBuffer();
}

/** Decodes a captured/selected image and returns a ≤1600 px JPEG plus a ≤200 px thumbnail. */
export async function processPhoto(file: Blob, deps: { decode?: (f: Blob) => Promise<ImageBitmap> } = {}): Promise<ProcessedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await (deps.decode ?? defaultDecode)(file);
  } catch {
    throw new UnsupportedPhotoError();
  }
  try {
    const full = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_EDGE);
    const small = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_EDGE);
    const data = await encodeJpeg(bitmap, full.width, full.height, PHOTO_QUALITY);
    const thumb = await encodeJpeg(bitmap, small.width, small.height, THUMB_QUALITY);
    return { data, width: full.width, height: full.height, thumb, mime: 'image/jpeg' };
  } finally {
    bitmap.close?.();
  }
}
