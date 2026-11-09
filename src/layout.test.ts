import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFor, leaf, leafIds, presetsFor, removeCell, split, splitCell } from './layout.ts';
import { computeLayout, frameSize, photoRect } from './geometry.ts';
import type { FrameStyle } from './types.ts';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const style: FrameStyle = { inner: 10, outer: 20, radiusInner: 0, radiusOuter: 0, color: '#fff', shadow: 0, shadowOpacity: 0 };

test('splitting a cell keeps its id and adds one', () => {
  const a = leaf('a');
  const { root, newId } = splitCell(a, 'a', 'row');
  assert.deepEqual(leafIds(root), ['a', newId]);
});

test('splitting the same way again joins the existing row with half sizes', () => {
  const root0 = split('row', [leaf('a'), leaf('b')]);
  const { root } = splitCell(root0, 'a', 'row');
  assert.equal(root.kind, 'split');
  if (root.kind !== 'split') return;
  assert.equal(root.children.length, 3);
  assert.deepEqual(root.sizes.map((s) => +s.toFixed(3)), [0.25, 0.25, 0.5]);
});

test('removing a cell gives its space to the neighbour and collapses', () => {
  const root0 = split('row', [leaf('a'), split('col', [leaf('b'), leaf('c')])]);
  const r1 = removeCell(root0, 'b');
  assert.deepEqual(leafIds(r1), ['a', 'c']);
  const r2 = removeCell(r1, 'c');
  assert.deepEqual(r2, leaf('a'));
  assert.deepEqual(removeCell(r2, 'a'), r2); // last cell stays
});

test('every preset has the right number of cells and sizes add to 1', () => {
  for (let n = 1; n <= 16; n++) {
    for (const p of presetsFor(n)) {
      assert.equal(leafIds(p).length, n, `preset for ${n}`);
      const check = (node: typeof p): void => {
        if (node.kind === 'split') {
          assert.ok(Math.abs(sum(node.sizes) - 1) < 1e-9);
          node.children.forEach(check);
        }
      };
      check(p);
    }
    assert.equal(leafIds(gridFor(n)).length, n);
  }
});

test('cells fill the frame inside the margin with exact gaps', () => {
  const root = split('row', [leaf('a'), split('col', [leaf('b'), leaf('c')])]);
  const { cells, dividers } = computeLayout(root, 1000, 1000, style);
  const [a, b, c] = cells;
  assert.equal(a.x, 20);
  assert.equal(a.y, 20);
  assert.equal(a.h, 960);
  assert.ok(Math.abs(b.x - (a.x + a.w + 10)) < 1e-9);
  assert.ok(Math.abs(c.y - (b.y + b.h + 10)) < 1e-9);
  assert.ok(Math.abs(b.x + b.w - 980) < 1e-9);
  assert.equal(dividers.length, 2);
});

test('photo covers the cell at zoom 1 and offsets stay inside', () => {
  const cell = { x: 0, y: 0, w: 100, h: 100 };
  const r = photoRect(cell, 400, 200, { photoId: 'p', zoom: 1, ox: 0, oy: 0 });
  assert.equal(r.h, 100);
  assert.equal(r.w, 200);
  assert.equal(r.x, -50);
  assert.equal(photoRect(cell, 400, 200, { photoId: 'p', zoom: 1, ox: -1, oy: 0 }).x, 0);
  assert.equal(photoRect(cell, 400, 200, { photoId: 'p', zoom: 1, ox: 1, oy: 0 }).x, -100);
});

test('frame size keeps the ratio on the long side', () => {
  assert.deepEqual(frameSize([4, 5], 3000), { W: 2400, H: 3000 });
  assert.deepEqual(frameSize([16, 9], 3000), { W: 3000, H: 1688 });
});

test('a photo turned on its side covers the cell with its height and width swapped', () => {
  const cell = { x: 0, y: 0, w: 100, h: 100 };
  // 400×200 landscape turned 90° becomes 200×400 portrait: width fits, height overflows
  const r = photoRect(cell, 400, 200, { photoId: 'p', zoom: 1, ox: 0, oy: 0, rot: 90 });
  assert.equal(r.w, 100);
  assert.equal(r.h, 200);
  assert.equal(r.y, -50);
  const flat = photoRect(cell, 400, 200, { photoId: 'p', zoom: 1, ox: 0, oy: 0, rot: 180 });
  assert.equal(flat.w, 200);
});
