import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATIOS } from './geometry.ts';
import { leafIds, presetsFor } from './layout.ts';
import { fitScore, startChoices } from './picker.ts';
import { DEFAULT_STYLE } from './store.ts';

test('opening screen: two layouts for every frame shape, right cell count', () => {
  for (const n of [2, 4, 7, 12]) {
    const list = startChoices(Array(n).fill(1.5), DEFAULT_STYLE);
    assert.equal(list.length, RATIOS.length * 2);
    RATIOS.forEach((r, i) => {
      const [a, b] = list.slice(i * 2, i * 2 + 2);
      assert.deepEqual([a.ratio, b.ratio], [r, r]);
      assert.notEqual(a.presetIndex, b.presetIndex);
      assert.equal(leafIds(a.root).length, n);
    });
  }
  assert.equal(startChoices([1], DEFAULT_STYLE).length, RATIOS.length); // one photo: one layout per shape
});

test('fit score: wide photos fit a side-by-side split worse than stacked', () => {
  const [side, stacked] = [presetsFor(2)[0], presetsFor(2)[1]];
  assert.ok(fitScore(stacked, [1, 1], [2, 2], DEFAULT_STYLE) < fitScore(side, [1, 1], [2, 2], DEFAULT_STYLE));
});

test('opening screen: the two layouts of one shape never look alike', async () => {
  const { layoutDistance } = await import('./picker.ts');
  for (const n of [2, 3, 5, 6, 9]) {
    const list = startChoices(Array.from({ length: n }, (_, i) => (i % 2 ? 1.33 : 0.75)), DEFAULT_STYLE);
    for (let i = 0; i < list.length; i += 2) assert.ok(layoutDistance(list[i].root, list[i + 1].root) >= 0.06, `n=${n} pair ${i}`);
  }
});
