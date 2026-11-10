import type { Dir, Leaf, LayoutNode, Split } from './types.ts';

let counter = 0;
export const uid = () => Math.random().toString(36).slice(2, 8) + (counter++).toString(36);

export const leaf = (id: string = uid()): Leaf => ({ kind: 'leaf', id });

export function split(dir: Dir, children: LayoutNode[], sizes?: number[]): Split {
  const raw = sizes ?? children.map(() => 1);
  const total = raw.reduce((a, b) => a + b, 0);
  return { kind: 'split', id: uid(), dir, children, sizes: raw.map((s) => s / total) };
}

/** Cell ids in reading order. */
export function leafIds(node: LayoutNode): string[] {
  return node.kind === 'leaf' ? [node.id] : node.children.flatMap(leafIds);
}

export function findNode(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node;
  if (node.kind === 'leaf') return null;
  for (const c of node.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

function findParent(node: LayoutNode, id: string): { parent: Split; index: number } | null {
  if (node.kind === 'leaf') return null;
  const index = node.children.findIndex((c) => c.id === id);
  if (index >= 0) return { parent: node, index };
  for (const c of node.children) {
    const hit = findParent(c, id);
    if (hit) return hit;
  }
  return null;
}

function replace(node: LayoutNode, id: string, next: LayoutNode): LayoutNode {
  if (node.id === id) return next;
  if (node.kind === 'leaf') return node;
  return { ...node, children: node.children.map((c) => replace(c, id, next)) };
}

/** Removes one-child splits and folds a split into its parent when both run the same way. */
export function normalize(node: LayoutNode): LayoutNode {
  if (node.kind === 'leaf') return node;
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((raw, i) => {
    const c = normalize(raw);
    const s = node.sizes[i];
    if (c.kind === 'split' && c.dir === node.dir) {
      c.children.forEach((cc, j) => {
        children.push(cc);
        sizes.push(s * c.sizes[j]);
      });
    } else {
      children.push(c);
      sizes.push(s);
    }
  });
  if (children.length === 1) return children[0];
  const total = sizes.reduce((a, b) => a + b, 0);
  return { ...node, children, sizes: sizes.map((s) => s / total) };
}

/** Splits a cell in two. The old cell keeps its id (and photo); returns the new cell's id. */
export function splitCell(root: LayoutNode, cellId: string, dir: Dir): { root: LayoutNode; newId: string } {
  const fresh = leaf();
  const at = findParent(root, cellId);
  if (at && at.parent.dir === dir) {
    const { parent, index } = at;
    const half = parent.sizes[index] / 2;
    const children = [...parent.children];
    const sizes = [...parent.sizes];
    children.splice(index + 1, 0, fresh);
    sizes.splice(index, 1, half, half);
    return { root: replace(root, parent.id, { ...parent, children, sizes }), newId: fresh.id };
  }
  const target = findNode(root, cellId);
  if (!target) return { root, newId: '' };
  return { root: normalize(replace(root, cellId, split(dir, [target, fresh]))), newId: fresh.id };
}

/** Removes a cell; its space goes to the neighbour. The last cell can't be removed. */
export function removeCell(root: LayoutNode, cellId: string): LayoutNode {
  const at = findParent(root, cellId);
  if (!at) return root;
  const { parent, index } = at;
  const children = parent.children.filter((_, i) => i !== index);
  const sizes = parent.sizes.filter((_, i) => i !== index);
  const heir = index < sizes.length ? index : index - 1;
  sizes[heir] += parent.sizes[index];
  return normalize(replace(root, parent.id, { ...parent, children, sizes }));
}

export function setSizes(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  const node = findNode(root, splitId);
  if (!node || node.kind !== 'split') return root;
  return replace(root, splitId, { ...node, sizes });
}

// ---------- ready-made layouts ----------

const L = () => leaf();
const R = (children: LayoutNode[], sizes?: number[]) => split('row', children, sizes);
const C = (children: LayoutNode[], sizes?: number[]) => split('col', children, sizes);
const many = (n: number) => Array.from({ length: n }, L);

/** An even grid that fits n cells, used when no hand-made layout exists. */
export function gridFor(n: number): LayoutNode {
  if (n <= 1) return L();
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const base = Math.floor(n / rows);
  let extra = n % rows;
  const lines: LayoutNode[] = [];
  for (let r = 0; r < rows; r++) {
    const k = base + (extra-- > 0 ? 1 : 0);
    lines.push(k === 1 ? L() : R(many(k)));
  }
  return lines.length === 1 ? lines[0] : C(lines);
}

const PRESETS: Record<number, (() => LayoutNode)[]> = {
  1: [L],
  2: [() => R(many(2)), () => C(many(2)), () => R(many(2), [2, 1]), () => C(many(2), [2, 1]), () => R(many(2), [1, 2]), () => C(many(2), [1, 2])],
  3: [
    () => R([L(), C(many(2))], [2, 1]),
    () => C([L(), R(many(2))], [2, 1]),
    () => R(many(3)),
    () => C(many(3)),
    () => R([C(many(2)), L()], [1, 2]),
  ],
  4: [
    () => R([C(many(2)), C(many(2))]),
    () => C([L(), R(many(3))], [2, 1]),
    () => R([L(), C(many(3))], [2, 1]),
    () => R(many(4)),
    () => C(many(4)),
  ],
  5: [
    () => R([C(many(2)), L(), C(many(2))], [1, 1.75, 1]),
    () => C([R(many(2)), R(many(3))]),
    () => C([L(), R(many(4))], [1.4, 1]),
    () => R([L(), C(many(4))], [2, 1]),
    () => C([R(many(2)), L(), R(many(2))]),
  ],
  6: [
    () => R([C(many(3)), C(many(3))]),
    () => C([R(many(3)), R(many(3))]),
    () => C([L(), R(many(2)), R(many(3))], [1.4, 1, 1]),
    () => R([C(many(2)), L(), C(many(3))], [1, 1.6, 1]),
  ],
  7: [
    () => C([R(many(2)), R(many(3)), R(many(2))]),
    () => C([L(), R(many(3)), R(many(3))], [1.5, 1, 1]),
    () => R([C(many(3)), C(many(2)), C(many(2))]),
  ],
  8: [
    () => C([R(many(2)), R(many(2)), R(many(2)), R(many(2))]),
    () => C([R(many(3)), R(many(2)), R(many(3))]),
    () => C([L(), R(many(4)), R(many(3))], [1.6, 1, 1]),
  ],
  9: [
    () => C([R(many(3)), R(many(3)), R(many(3))]),
    () => C([L(), R(many(4)), R(many(4))], [1.6, 1, 1]),
    () => R([C(many(3)), C(many(3)), C(many(3))], [1, 1.4, 1]),
  ],
};

/** Ways to share n cells out over lines of 1..maxPer cells, at most maxLines lines. */
function compositions(n: number, maxPer: number, maxLines: number): number[][] {
  const out: number[][] = [];
  const walk = (left: number, acc: number[]) => {
    if (left === 0) return void out.push(acc);
    if (acc.length === maxLines) return;
    for (let k = 1; k <= Math.min(maxPer, left); k++) walk(left - k, [...acc, k]);
  };
  walk(n, []);
  return out;
}

/** m cells in one line, or in two lines when there are many. */
function band(m: number, dir: Dir): LayoutNode {
  const along = dir === 'row' ? R : C;
  const across = dir === 'row' ? C : R;
  if (m === 1) return L();
  if (m <= 4) return along(many(m));
  const a = Math.ceil(m / 2);
  return across([along(many(a)), along(many(m - a))]);
}

/** Made by rule: one big photo on any side, then rows (or columns) of 1–4 photos — evenest first. */
function generated(n: number): LayoutNode[] {
  const out: LayoutNode[] = [];
  if (n >= 3) {
    const m = n - 1;
    out.push(
      C([L(), band(m, 'row')], [2, 1]),
      C([band(m, 'row'), L()], [1, 2]),
      R([L(), band(m, 'col')], [2, 1]),
      R([band(m, 'col'), L()], [1, 2]),
      R([band(Math.floor(m / 2), 'col'), L(), band(m - Math.floor(m / 2), 'col')], [1, 2, 1]),
      C([band(Math.floor(m / 2), 'row'), L(), band(m - Math.floor(m / 2), 'row')], [1, 2, 1]),
    );
  }
  const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
  const comps = compositions(n, 4, 4).sort((a, b) => spread(a) - spread(b) || a.length - b.length);
  for (const c of comps) {
    out.push(C(c.map((k) => (k === 1 ? L() : R(many(k))))));
    out.push(R(c.map((k) => (k === 1 ? L() : C(many(k))))));
  }
  return out;
}

/** Same look = same key: the cells' boxes in a unit square, rounded and sorted (so a 2×2 made of rows equals one made of columns). */
function shapeKey(root: LayoutNode): string {
  const boxes: string[] = [];
  const walk = (n: LayoutNode, x: number, y: number, w: number, h: number) => {
    if (n.kind === 'leaf') return void boxes.push([x, y, w, h].map((v) => v.toFixed(3)).join(' '));
    let at = 0;
    n.children.forEach((c, i) => {
      const s = n.sizes[i];
      if (n.dir === 'row') walk(c, x + at * w, y, s * w, h);
      else walk(c, x, y + at * h, w, s * h);
      at += s;
    });
  };
  walk(root, 0, 0, 1, 1);
  return boxes.sort().join('|');
}

const MAX_CHOICES = 24;

/** Ready-made layouts for n cells (fresh copies every call, same order every call): hand-made first, then made by rule. */
export function presetsFor(n: number): LayoutNode[] {
  const hand = (PRESETS[n] ?? []).map((f) => f());
  const seen = new Set<string>();
  const out: LayoutNode[] = [];
  for (const raw of [...hand, ...generated(n), gridFor(n)]) {
    const node = normalize(raw);
    const key = shapeKey(node);
    if (seen.has(key) || leafIds(node).length !== n) continue;
    seen.add(key);
    out.push(node);
    if (out.length === MAX_CHOICES) break;
  }
  return out;
}
