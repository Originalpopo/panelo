import { useStore } from '../store.ts';
import type { FrameStyle } from '../types.ts';

const PALETTE = [
  '#ffffff', '#f4f1ea', '#e8e1d3', '#d6cbb5', '#b9a98a', '#8a7a5e', '#5a4e3c', '#2b2620',
  '#f6d5d0', '#ee9a8e', '#e0564a', '#b8322a', '#7d1f1a', '#f8c8dc', '#e77fa8', '#a83a6b',
  '#fbe3a6', '#ffcb47', '#f29d38', '#d4682a', '#c9e4c5', '#8cc084', '#4f8a5b', '#2f5d3f',
  '#cde7ef', '#7cc0d8', '#2f86b0', '#1d4e75', '#d9d3ef', '#a294d4', '#6650a8', '#3b2d6b',
  '#e6e6e6', '#bdbdbd', '#8f8f8f', '#666666', '#454545', '#2b2b2b', '#161616', '#000000',
];

export type BorderSub = 'adjust' | 'margin' | 'corner' | 'color';
export const BORDER_SUBS: { id: BorderSub; label: string }[] = [
  { id: 'adjust', label: 'adjust' },
  { id: 'margin', label: 'margin' },
  { id: 'corner', label: 'corner' },
  { id: 'color', label: 'color' },
];

export function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="lbl">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** The controls for one Border sub-menu. Sliders come in pairs on one row. */
export default function BorderControls({ sub }: { sub: BorderSub }) {
  const style = useStore((s) => s.doc!.style);
  const { commit } = useStore.getState();

  const set = (key: keyof FrameStyle) => (v: number | string) => commit((d) => ({ ...d, style: { ...d.style, [key]: v } }), 'style:' + key);
  const pickColor = (c: string) => commit((d) => ({ ...d, style: { ...d.style, color: c } }), 'style:color');

  // adjust: only the handles on the frame (drag a gap to resize the cells beside it) — no panel.
  if (sub === 'adjust') return null;

  return (
    <div className="panel border">
      {sub === 'margin' && (
        <div className="sliders">
          <Slider label="Inner" value={style.inner} min={0} max={80} onChange={set('inner')} />
          <Slider label="Outer" value={style.outer} min={0} max={120} onChange={set('outer')} />
        </div>
      )}
      {sub === 'corner' && (
        <div className="sliders">
          <Slider label="Inner" value={style.radiusInner} min={0} max={150} onChange={set('radiusInner')} />
          <Slider label="Outer" value={style.radiusOuter} min={0} max={150} onChange={set('radiusOuter')} />
        </div>
      )}
      {sub === 'color' && (
        <div className="colors">
          <div className="cap">
            Presets
            <label className="custom">
              <input type="color" value={style.color} onChange={(e) => commit((d) => ({ ...d, style: { ...d.style, color: e.target.value } }), 'style:color')} />
              Custom
            </label>
          </div>
          <div className="swatches grid">
            {PALETTE.map((c) => (
              <button key={c} className={`sw ${c === style.color ? 'on' : ''}`} style={{ background: c }} onClick={() => pickColor(c)} aria-label={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
