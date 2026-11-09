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
  2: [() => R(many(2)), () => C(many(2)), () => R(many(2), [2, 1]), () => C(many(2), [2, 1])],
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

/** Ready-made layouts for n cells (fresh copies every call). */
export function presetsFor(n: number): LayoutNode[] {
  const list = PRESETS[n];
  return list ? list.map((f) => f()) : [gridFor(n)];
}
