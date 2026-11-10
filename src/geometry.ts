import type { Dir, FrameStyle, LayoutNode, Placement } from './types.ts';

export type Rect = { x: number; y: number; w: number; h: number };
export type CellRect = Rect & { id: string };
export type DividerRect = Rect & { splitId: string; index: number; dir: Dir; avail: number };

/** Pixel size of one style unit (thousandths of the short side). */
export const unit = (W: number, H: number) => Math.min(W, H) / 1000;

/** Positions of every cell and every gap between cells, for a frame W×H pixels. */
export function computeLayout(root: LayoutNode, W: number, H: number, style: FrameStyle) {
  const k = unit(W, H);
  const gap = style.inner * k;
  const margin = style.outer * k;
  const cells: CellRect[] = [];
  const dividers: DividerRect[] = [];

  const walk = (n: LayoutNode, r: Rect) => {
    if (n.kind === 'leaf') {
      cells.push({ id: n.id, ...r });
      return;
    }
    const horiz = n.dir === 'row';
    const len = horiz ? r.w : r.h;
    const avail = Math.max(0, len - gap * (n.children.length - 1));
    let pos = horiz ? r.x : r.y;
    n.children.forEach((child, i) => {
      const l = avail * n.sizes[i];
      walk(child, horiz ? { x: pos, y: r.y, w: l, h: r.h } : { x: r.x, y: pos, w: r.w, h: l });
      pos += l;
      if (i < n.children.length - 1) {
        const base = { splitId: n.id, index: i, dir: n.dir, avail };
        dividers.push(horiz ? { ...base, x: pos, y: r.y, w: gap, h: r.h } : { ...base, x: r.x, y: pos, w: r.w, h: gap });
        pos += gap;
      }
    });
  };

  walk(root, { x: margin, y: margin, w: Math.max(0, W - 2 * margin), h: Math.max(0, H - 2 * margin) });
  return { cells, dividers, k };
}

/** True when the photo is turned on its side (90° or 270°). */
export const sideways = (p: Placement) => ((p.rot ?? 0) / 90) % 2 === 1;

/**
 * Where to draw a photo so it covers the cell, honouring zoom, offset and rotation.
 * The rect is the turned photo's outline; draw the image rotated about the rect's centre.
 */
export function photoRect(cell: Rect, pw: number, ph: number, p: Placement): Rect {
  const [iw, ih] = sideways(p) ? [ph, pw] : [pw, ph];
  const s = Math.max(cell.w / iw, cell.h / ih) * p.zoom;
  const w = iw * s;
  const h = ih * s;
  return { x: cell.x - ((w - cell.w) / 2) * (1 + p.ox), y: cell.y - ((h - cell.h) / 2) * (1 + p.oy), w, h };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Frame size in pixels for a ratio, with the long side = longSide. */
export function frameSize(ratio: [number, number], longSide: number) {
  const [rw, rh] = ratio;
  return rw >= rh
    ? { W: longSide, H: Math.round((longSide * rh) / rw) }
    : { W: Math.round((longSide * rw) / rh), H: longSide };
}

/** Frame shapes offered (width : height). */
export const RATIOS: [number, number][] = [
  [1, 1],
  [4, 5],
  [3, 4],
  [2, 3],
  [9, 16],
  [4, 3],
  [3, 2],
  [16, 9],
];
