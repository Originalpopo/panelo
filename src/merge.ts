import type { LayoutNode } from './types.ts';
import { computeLayout, type CellRect, type Rect } from './geometry.ts';
import { leaf, normalize, split } from './layout.ts';

const EPS = 1e-6;
const NO_GAPS = { inner: 0, outer: 0, radiusInner: 0, radiusOuter: 0, color: '', shadow: 0, shadowOpacity: 0 };
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** Cell rectangles in a 1×1 square with no gaps — enough to reason about who touches whom. */
function unitCells(root: LayoutNode): CellRect[] {
  return computeLayout(root, 1000, 1000, NO_GAPS).cells.map((c) => ({ id: c.id, x: c.x / 1000, y: c.y / 1000, w: c.w / 1000, h: c.h / 1000 }));
}

/** True when the two cells touch along an edge (not just at a corner). */
export function areNeighbours(root: LayoutNode, a: string, b: string): boolean {
  const cells = unitCells(root);
  const A = cells.find((c) => c.id === a);
  const B = cells.find((c) => c.id === b);
  if (!A || !B || a === b) return false;
  const overlapX = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const overlapY = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  const touchX = near(A.x + A.w, B.x) || near(B.x + B.w, A.x);
  const touchY = near(A.y + A.h, B.y) || near(B.y + B.h, A.y);
  return (touchX && overlapY > EPS) || (touchY && overlapX > EPS);
}

/** Rebuilds a layout tree from rectangles by cutting straight across wherever no cell is crossed. */
function build(rects: CellRect[], region: Rect): LayoutNode | null {
  if (rects.length === 1) return leaf(rects[0].id);
  for (const dir of ['row', 'col'] as const) {
    const start = (r: Rect) => (dir === 'row' ? r.x : r.y);
    const len = (r: Rect) => (dir === 'row' ? r.w : r.h);
    const regionEnd = start(region) + len(region);
    const cuts = [...new Set(rects.map((r) => start(r) + len(r)))]
      .filter((c) => c < regionEnd - EPS)
      .filter((c) => rects.every((r) => start(r) + len(r) <= c + EPS || start(r) >= c - EPS))
      .sort((p, q) => p - q);
    if (cuts.length === 0) continue;
    const edges = [start(region), ...cuts, regionEnd];
    const children: LayoutNode[] = [];
    const sizes: number[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      const part = rects.filter((r) => start(r) >= lo - EPS && start(r) + len(r) <= hi + EPS);
      const sub = dir === 'row' ? { ...region, x: lo, w: hi - lo } : { ...region, y: lo, h: hi - lo };
      const child = build(part, sub);
      if (!child) return null;
      children.push(child);
      sizes.push(hi - lo);
    }
    return split(dir, children, sizes);
  }
  return null; // cells interlock (pinwheel) — no straight cut exists
}

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const overlaps = (a: Rect, b: Rect) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS;

/**
 * Joins the first cell with a neighbour (left, right, above or below). The new cell is the box
 * around both; any cell caught partly inside that box makes the box grow until only whole cells
 * are inside. Every cell in the box is broken up and taken over by the first cell, which keeps
 * its id and photo. Returns null when the cells don't touch or no clean layout results.
 */
export function mergeCells(root: LayoutNode, keepId: string, dropId: string): { root: LayoutNode; removed: string[] } | null {
  if (keepId === dropId || !areNeighbours(root, keepId, dropId)) return null;
  const cells = unitCells(root);
  const A = cells.find((c) => c.id === keepId)!;
  const B = cells.find((c) => c.id === dropId)!;

  let box = union(A, B);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of cells) {
      const inside = c.x >= box.x - EPS && c.y >= box.y - EPS && c.x + c.w <= box.x + box.w + EPS && c.y + c.h <= box.y + box.h + EPS;
      if (!inside && overlaps(c, box)) {
        box = union(box, c);
        grew = true;
      }
    }
  }

  const removed = cells.filter((c) => c.id !== keepId && overlaps(c, box)).map((c) => c.id);
  const rest = cells.filter((c) => c.id !== keepId && !removed.includes(c.id));
  const tree = build([...rest, { id: keepId, ...box }], { x: 0, y: 0, w: 1, h: 1 });
  return tree ? { root: normalize(tree), removed } : null;
}
