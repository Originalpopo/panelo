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

/** Tilt goes all the way round: kept between -180° and 180°. */
export const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
/** Near straight or a quarter turn, a tilt snaps onto it (within `by` degrees). */
export const snapTilt = (d: number, by: number) => {
  const q = Math.round(d / 90) * 90;
  return Math.abs(d - q) < by ? wrapDeg(q) : d;
};

/**
 * Where to draw a photo: an image w×h, centred on (cx, cy), turned by deg.
 * It is always big enough to cover the whole cell at any angle — the cell, seen from the photo's own
 * (turned) sides, is a box bw×bh, and the photo is scaled to cover that box. sx/sy is the room the photo
 * has to slide along its own sides; ox/oy (-1..1) say how much of it is used, so no gap can ever show.
 */
export type PhotoPlace = { cx: number; cy: number; w: number; h: number; deg: number; rad: number; sx: number; sy: number };

export function photoPlace(cell: Rect, pw: number, ph: number, p: Placement): PhotoPlace {
  const deg = (p.rot ?? 0) + (p.tilt ?? 0);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const c = Math.abs(cos) < 1e-9 ? 0 : Math.abs(cos);
  const s = Math.abs(sin) < 1e-9 ? 0 : Math.abs(sin);
  const bw = cell.w * c + cell.h * s;
  const bh = cell.w * s + cell.h * c;
  const k = Math.max(bw / pw, bh / ph) * p.zoom;
  const w = pw * k;
  const h = ph * k;
  const sx = Math.max(0, (w - bw) / 2);
  const sy = Math.max(0, (h - bh) / 2);
  // the photo's centre, measured along its own sides from the cell's centre, then turned onto the screen
  const lx = -p.ox * sx;
  const ly = -p.oy * sy;
  return { cx: cell.x + cell.w / 2 + lx * cos - ly * sin, cy: cell.y + cell.h / 2 + lx * sin + ly * cos, w, h, deg, rad, sx, sy };
}

/** A finger slid (dx, dy) on screen: the new ox/oy for a photo placed as `at` (the slide is turned onto the photo's own sides). */
export function slidePhoto(at: PhotoPlace, start: Placement, dx: number, dy: number): { ox: number; oy: number } {
  const cos = Math.cos(at.rad);
  const sin = Math.sin(at.rad);
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return {
    ox: at.sx > 0.25 ? clamp(start.ox - lx / at.sx, -1, 1) : 0,
    oy: at.sy > 0.25 ? clamp(start.oy - ly / at.sy, -1, 1) : 0,
  };
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
