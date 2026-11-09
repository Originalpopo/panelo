import { ImagePlus } from 'lucide-react';
import { useStore } from '../store.ts';
import { leafIds, presetsFor } from '../layout.ts';
import { computeLayout, frameSize } from '../geometry.ts';
import type { LayoutNode } from '../types.ts';

export type LayoutSub = 'add' | 'merge' | 'adjust';
export const LAYOUT_SUBS: { id: LayoutSub; label: string }[] = [
  { id: 'add', label: 'add' },
  { id: 'merge', label: 'merge' },
  { id: 'adjust', label: 'adjust' },
];

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

const THUMB_STYLE = { inner: 30, outer: 40, radiusInner: 0, radiusOuter: 0, color: '', shadow: 0, shadowOpacity: 0 };

function Thumb({ root, ratio }: { root: LayoutNode; ratio: [number, number] }) {
  const { W, H } = frameSize(ratio, 52);
  const { cells } = computeLayout(root, W, H, THUMB_STYLE);
  return (
    <div className="pthumb" style={{ width: W, height: H }}>
      {cells.map((c) => (
        <i key={c.id} style={{ left: c.x, top: c.y, width: c.w, height: c.h }} />
      ))}
    </div>
  );
}

/** add: bring in more photos — the layout re-picks itself for the new count. Below, other layouts for the same count. */
function AddControls({ onAddPhotos }: { onAddPhotos: () => void }) {
  const doc = useStore((s) => s.doc)!;
  const presetIndex = useStore((s) => s.presetIndex);
  const { applyLayout, setPresetIndex } = useStore.getState();
  const placed = Object.values(doc.cells).filter((p) => p.photoId).length;
  const count = Math.max(1, placed || leafIds(doc.root).length);
  const list = presetsFor(count);

  return (
    <div className="panel slim">
      <div className="strip layouts">
        <button className="thumb add" onClick={onAddPhotos} aria-label="Add photos">
          <ImagePlus size={20} />
        </button>
        {list.map((root, i) => (
          <button
            key={`${count}:${i}`}
            className={`lthumb ${i === presetIndex ? 'on' : ''}`}
            onClick={() => {
              setPresetIndex(i);
              applyLayout(presetsFor(count)[i]);
            }}
          >
            <Thumb root={root} ratio={doc.ratio} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** adjust: frame shape only. Cell sizes are changed with the handles on the frame. */
function AdjustControls() {
  const doc = useStore((s) => s.doc)!;
  const { commit } = useStore.getState();
  return (
    <div className="panel slim">
      <div className="chips">
        {RATIOS.map((r) => {
          const on = r[0] === doc.ratio[0] && r[1] === doc.ratio[1];
          const k = 18 / Math.max(r[0], r[1]);
          return (
            <button key={r.join(':')} className={`chip ${on ? 'on' : ''}`} onClick={() => commit((d) => ({ ...d, ratio: r }))}>
              <i style={{ width: r[0] * k, height: r[1] * k }} />
              {r[0]}:{r[1]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LayoutControls({ sub, onAddMore }: { sub: LayoutSub; onAddMore: () => void }) {
  if (sub === 'add') return <AddControls onAddPhotos={onAddMore} />;
  if (sub === 'merge') return null; // merge works by dragging on the frame — no controls
  return <AdjustControls />;
}
