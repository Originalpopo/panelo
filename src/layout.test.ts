import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFor, leaf, leafIds, presetsFor, removeCell, split, splitCell } from './layout.ts';
import { computeLayout, frameSize, photoPlace, slidePhoto } from './geometry.ts';
import type { FrameStyle } from './types.ts';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const style: FrameStyle = { inner: 10, outer: 20, radiusInner: 0, radiusOuter: 0, color: '#fff' };

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

test('layout choices: same order every call, no two look alike', () => {
  const look = (p: ReturnType<typeof computeLayout>) => p.cells.map((c) => [c.x, c.y, c.w, c.h].map(Math.round).join(' ')).sort().join('|');
  for (let n = 1; n <= 16; n++) {
    const a = presetsFor(n).map((p) => look(computeLayout(p, 1000, 1000, style)));
    const b = presetsFor(n).map((p) => look(computeLayout(p, 1000, 1000, style)));
    assert.deepEqual(a, b, `order for ${n}`);
    assert.equal(new Set(a).size, a.length, `duplicates for ${n}`);
  }
  assert.ok(presetsFor(4).length >= 15);
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
  const r = photoPlace(cell, 400, 200, { photoId: 'p', zoom: 1, ox: 0, oy: 0 });
  assert.equal(r.h, 100);
  assert.equal(r.w, 200);
  assert.equal(r.cx, 50);
  // slid fully one way: the photo's left (or right) edge sits on the cell's edge
  assert.equal(photoPlace(cell, 400, 200, { photoId: 'p', zoom: 1, ox: -1, oy: 0 }).cx - 100, 0);
  assert.equal(photoPlace(cell, 400, 200, { photoId: 'p', zoom: 1, ox: 1, oy: 0 }).cx + 100, 100);
});

test('frame size keeps the ratio on the long side', () => {
  assert.deepEqual(frameSize([4, 5], 3000), { W: 2400, H: 3000 });
  assert.deepEqual(frameSize([16, 9], 3000), { W: 3000, H: 1688 });
});

test('a photo turned on its side covers the cell with its height and width swapped', () => {
  const cell = { x: 0, y: 0, w: 100, h: 100 };
  // 400×200 landscape turned 90° becomes 200×400 portrait: width fits, height overflows
  const r = photoPlace(cell, 400, 200, { photoId: 'p', zoom: 1, ox: 0, oy: 0, rot: 90 });
  assert.equal(r.w, 200);
  assert.equal(r.h, 100);
  assert.ok(Math.abs(r.sx - 50) < 1e-9 && r.sy === 0);
  // sliding the finger down moves a sideways photo along its own long side
  const moved = slidePhoto(r, { photoId: 'p', zoom: 1, ox: 0, oy: 0, rot: 90 }, 0, 25);
  assert.ok(Math.abs(moved.ox + 0.5) < 1e-9 && moved.oy === 0);
});

test('a tilted photo never leaves a gap in its cell, whatever the zoom, slide or angle', () => {
  const cells = [{ x: 10, y: 20, w: 100, h: 100 }, { x: 0, y: 0, w: 300, h: 80 }, { x: 5, y: 5, w: 60, h: 240 }];
  const sizes: [number, number][] = [[400, 300], [300, 400], [1000, 200]];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 3000; n++) {
    const cell = cells[n % 3];
    const [pw, ph] = sizes[Math.floor(n / 3) % 3];
    const p = { photoId: 'p', zoom: 1 + rnd() * 2, ox: rnd() * 2 - 1, oy: rnd() * 2 - 1, rot: 90 * Math.floor(rnd() * 4), tilt: rnd() * 90 - 45 };
    const at = photoPlace(cell, pw, ph, p);
    const cos = Math.cos(at.rad);
    const sin = Math.sin(at.rad);
    for (const [x, y] of [[cell.x, cell.y], [cell.x + cell.w, cell.y], [cell.x, cell.y + cell.h], [cell.x + cell.w, cell.y + cell.h]]) {
      // the cell corner, seen from the photo's own sides
      const lx = (x - at.cx) * cos + (y - at.cy) * sin;
      const ly = -(x - at.cx) * sin + (y - at.cy) * cos;
      assert.ok(Math.abs(lx) <= at.w / 2 + 1e-6 && Math.abs(ly) <= at.h / 2 + 1e-6, `corner outside photo: ${JSON.stringify(p)}`);
    }
  }
});
