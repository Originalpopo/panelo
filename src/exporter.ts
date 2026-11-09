import type { Doc, Photo } from './types.ts';
import { computeLayout, frameSize, photoRect, sideways, type Rect } from './geometry.ts';

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

async function loadImage(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** Draws the frame at full size. Rounded outer corners need see-through edges, so those save as PNG; otherwise JPEG. */
export async function renderFrame(doc: Doc, photos: Record<string, Photo>, longSide: number): Promise<File> {
  const { W, H } = frameSize(doc.ratio, longSide);
  const { cells, k } = computeLayout(doc.root, W, H, doc.style);
  const st = doc.style;
  const png = st.radiusOuter > 0;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  roundRectPath(ctx, { x: 0, y: 0, w: W, h: H }, st.radiusOuter * k);
  ctx.clip();
  ctx.fillStyle = st.color;
  ctx.fillRect(0, 0, W, H);

  for (const cell of cells) {
    const p = doc.cells[cell.id];
    const photo = p?.photoId ? photos[p.photoId] : undefined;
    const radius = st.radiusInner * k;
    // An empty cell is left in the frame colour (no shadow, no placeholder).
    if (!photo || !p) continue;

    if (st.shadow > 0 && st.shadowOpacity > 0) {
      ctx.save();
      ctx.shadowColor = `rgba(0,0,0,${st.shadowOpacity})`;
      ctx.shadowBlur = st.shadow * k;
      roundRectPath(ctx, cell, radius);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    roundRectPath(ctx, cell, radius);
    ctx.clip();
    const img = await loadImage(photo.url);
    const r = photoRect(cell, photo.w, photo.h, p);
    const [dw, dh] = sideways(p) ? [r.h, r.w] : [r.w, r.h];
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.rotate(((p.rot ?? 0) * Math.PI) / 180);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    img.src = ''; // let the browser drop the decoded full-size photo before the next one
    ctx.restore();
  }

  const type = png ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.93));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('Could not create the image');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  return new File([blob], `panelo-${stamp}.${png ? 'png' : 'jpg'}`, { type });
}
