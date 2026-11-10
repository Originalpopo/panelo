import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaf, leafIds, split } from './layout.ts';
import { areNeighbours, mergeCells } from './merge.ts';
import { computeLayout } from './geometry.ts';
import type { LayoutNode } from './types.ts';

const NO_GAPS = { inner: 0, outer: 0, radiusInner: 0, radiusOuter: 0, color: '' };
const rectOf = (root: LayoutNode, id: string) => {
  const c = computeLayout(root, 900, 900, NO_GAPS).cells.find((c) => c.id === id)!;
  return [c.x, c.y, c.w, c.h].map((v) => Math.round(v));
};
const grid3 = () =>
  split('col', [
    split('row', [leaf('1'), leaf('2'), leaf('3')]),
    split('row', [leaf('4'), leaf('5'), leaf('6')]),
    split('row', [leaf('7'), leaf('8'), leaf('9')]),
  ]);

test('merging two cells side by side in one row', () => {
  const root = split('row', [leaf('a'), leaf('b'), leaf('c')]);
  const r = mergeCells(root, 'b', 'c')!;
  assert.deepEqual(leafIds(r.root), ['a', 'b']);
  assert.deepEqual(r.removed, ['c']);
  assert.deepEqual(rectOf(r.root, 'b'), [300, 0, 600, 900]);
});

test('the first cell keeps its id even when it is on the right', () => {
  const r = mergeCells(split('row', [leaf('a'), leaf('b')]), 'b', 'a')!;
  assert.deepEqual(r.root, leaf('b'));
});

test('merging across branches of a 2×2 grid rebuilds the layout', () => {
  const root = split('row', [split('col', [leaf('a'), leaf('c')]), split('col', [leaf('b'), leaf('d')])]);
  const r = mergeCells(root, 'a', 'b')!;
  assert.deepEqual(rectOf(r.root, 'a'), [0, 0, 900, 450]);
  assert.deepEqual(rectOf(r.root, 'c'), [0, 450, 450, 450]);
  assert.deepEqual(rectOf(r.root, 'd'), [450, 450, 450, 450]);
});

test('the user’s example: 3→1 makes a full top row, then 6→3 breaks 4 and 5 and takes the top two rows', () => {
  // as on screen: 1 has already taken over 2, so the top row is [1 (wide), 3]
  const step0 = mergeCells(grid3(), '1', '2')!;
  const step1 = mergeCells(step0.root, '3', '1')!;
  assert.deepEqual(step1.removed, ['1']);
  assert.deepEqual(rectOf(step1.root, '3'), [0, 0, 900, 300]);

  const step2 = mergeCells(step1.root, '6', '3')!;
  assert.deepEqual(step2.removed.sort(), ['3', '4', '5']);
  assert.deepEqual(rectOf(step2.root, '6'), [0, 0, 900, 600]);
  assert.deepEqual(leafIds(step2.root), ['6', '7', '8', '9']);
});

test('the box grows until only whole cells are inside', () => {
  // left: one tall cell; right: two stacked cells. a→b covers everything.
  const root = split('row', [leaf('a'), split('col', [leaf('b'), leaf('c')])]);
  const r = mergeCells(root, 'a', 'b')!;
  assert.deepEqual(r.root, leaf('a'));
  assert.deepEqual(r.removed.sort(), ['b', 'c']);
});

test('cells that only meet at a corner cannot merge', () => {
  assert.equal(mergeCells(grid3(), '1', '5'), null);
});

test('neighbours touch along an edge, not just a corner', () => {
  const root = split('row', [split('col', [leaf('a'), leaf('c')]), split('col', [leaf('b'), leaf('d')])]);
  assert.equal(areNeighbours(root, 'a', 'b'), true);
  assert.equal(areNeighbours(root, 'a', 'c'), true);
  assert.equal(areNeighbours(root, 'a', 'd'), false);
});

test('sizes are kept when merging inside an uneven layout', () => {
  const root = split('row', [leaf('a'), split('col', [leaf('b'), leaf('c'), leaf('d')])], [2, 1]);
  const r = mergeCells(root, 'c', 'b')!;
  assert.deepEqual(leafIds(r.root), ['a', 'c', 'd']);
  assert.deepEqual(rectOf(r.root, 'a'), [0, 0, 600, 900]);
  assert.deepEqual(rectOf(r.root, 'c'), [600, 0, 300, 600]);
});
