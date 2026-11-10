import { RATIOS, computeLayout, frameSize } from './geometry.ts';
import { presetsFor } from './layout.ts';
import type { FrameStyle, LayoutNode } from './types.ts';

export type StartChoice = { ratio: [number, number]; root: LayoutNode; presetIndex: number };

/**
 * How badly the photos fit a layout in a frame shape: how much of each photo gets cut off
 * (photo i goes in cell i), plus a penalty for cells too thin to see.
 */
export function fitScore(root: LayoutNode, ratio: [number, number], aspects: number[], style: FrameStyle): number {
  const { W, H } = frameSize(ratio, 1000);
  const { cells } = computeLayout(root, W, H, style);
  const short = Math.min(W, H);
  let total = 0;
  cells.forEach((c, i) => {
    const cell = c.w / Math.max(1, c.h);
    const photo = aspects[i] ?? 1;
    total += 1 - Math.min(cell / photo, photo / cell); // share of the photo cut off
    total += Math.max(0, 0.15 - Math.min(c.w, c.h) / short) * 4; // too thin
  });
  return total / Math.max(1, cells.length);
}

/** A layout already shown counts as this much worse each time, so the list doesn't repeat itself. */
const REPEAT_PENALTY = 0.06;
/** Two layouts in the same shape must differ by at least this much (see layoutDistance). */
const MIN_DIFFERENCE = 0.06;

/** Cell boxes in a unit square (0..1 on both sides). */
function unitBoxes(root: LayoutNode): number[][] {
  const { cells } = computeLayout(root, 1000, 1000, { inner: 0, outer: 0, radiusInner: 0, radiusOuter: 0, color: '' });
  return cells.map((c) => [c.x / 1000, c.y / 1000, (c.x + c.w) / 1000, (c.y + c.h) / 1000]);
}

/** How different two layouts look: for each cell, how far its edges are from the closest cell of the other layout (average, both ways). */
export function layoutDistance(a: LayoutNode, b: LayoutNode): number {
  const A = unitBoxes(a);
  const B = unitBoxes(b);
  const near = (from: number[][], to: number[][]) =>
    from.reduce((sum, p) => sum + Math.min(...to.map((q) => p.reduce((d, v, i) => d + Math.abs(v - q[i]), 0) / 4)), 0) / from.length;
  return (near(A, B) + near(B, A)) / 2;
}

/** The opening choices: for every frame shape, the two layouts that fit the photos best (favouring ones not shown yet, and never two look-alikes). */
export function startChoices(aspects: number[], style: FrameStyle, perRatio = 2): StartChoice[] {
  const n = Math.max(1, Math.min(aspects.length, 16));
  const shown = new Map<number, number>();
  const out: StartChoice[] = [];
  for (const ratio of RATIOS) {
    const ranked = presetsFor(n)
      .map((root, presetIndex) => ({ root, presetIndex, score: fitScore(root, ratio, aspects, style) + (shown.get(presetIndex) ?? 0) * REPEAT_PENALTY }))
      .sort((a, b) => a.score - b.score || a.presetIndex - b.presetIndex);
    const picked: typeof ranked = [];
    for (const r of ranked) {
      if (picked.length === perRatio) break;
      if (picked.every((p) => layoutDistance(p.root, r.root) >= MIN_DIFFERENCE)) picked.push(r);
    }
    for (const { root, presetIndex } of picked) {
      shown.set(presetIndex, (shown.get(presetIndex) ?? 0) + 1);
      out.push({ ratio, root, presetIndex });
    }
  }
  return out;
}
