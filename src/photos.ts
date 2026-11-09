import type { Photo } from './types.ts';
import { uid } from './layout.ts';

/** Full copy: used only when saving the frame. Kept as compressed JPEG, so it costs little memory until export. */
const FULL_SIDE = 3200;
/** Screen copy: what the editor shows. A phone screen never needs more, and it uses ~7× less memory. */
const PREVIEW_SIDE = 1200;

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

/** Draws src at most maxSide on the long side and returns it as a JPEG. */
async function toJpeg(src: CanvasImageSource, w: number, h: number, maxSide: number, quality: number) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * s);
  const ch = Math.round(h * s);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  canvas.width = canvas.height = 0; // free memory right away (matters on iPhone)
  return blob ? { blob, w: cw, h: ch } : null;
}

export async function importFiles(files: File[]): Promise<Photo[]> {
  const out: Photo[] = [];
  for (const file of files) {
    try {
      const { src, w, h, done } = await decode(file);
      const full = await toJpeg(src, w, h, FULL_SIDE, 0.92);
      const preview = await toJpeg(src, w, h, PREVIEW_SIDE, 0.85);
      done();
      if (!full || !preview) continue;
      out.push({ id: uid(), url: URL.createObjectURL(full.blob), preview: URL.createObjectURL(preview.blob), w: full.w, h: full.h });
    } catch (e) {
      console.warn('skip photo', file.name, e);
    }
  }
  return out;
}
