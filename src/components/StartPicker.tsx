import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useStore } from '../store.ts';
import { computeLayout, frameSize } from '../geometry.ts';
import { startChoices, type StartChoice } from '../picker.ts';

/** One choice drawn with the real photos (photo i in cell i, each filling its cell). */
function Preview({ choice, longSide, onPick }: { choice: StartChoice; longSide: number; onPick: () => void }) {
  const doc = useStore((s) => s.doc)!;
  const photos = useStore((s) => s.photos);
  const order = useStore((s) => s.photoOrder);
  const { W, H } = frameSize(choice.ratio, longSide);
  const { cells } = computeLayout(choice.root, W, H, doc.style);
  return (
    <button className="start-item" style={{ width: W, height: H, background: doc.style.color }} onClick={onPick} aria-label={`${choice.ratio[0]}:${choice.ratio[1]}`}>
      {cells.map((c, i) => {
        const photo = photos[order[i]];
        return (
          <span key={c.id} style={{ left: c.x, top: c.y, width: c.w, height: c.h }}>
            {photo && <img src={photo.preview} alt="" draggable={false} />}
          </span>
        );
      })}
    </button>
  );
}

/** Opening screen after choosing photos: every frame shape, two layouts each, scroll up and down, tap one to start. */
export default function StartPicker({ onBack }: { onBack: () => void }) {
  const photos = useStore((s) => s.photos);
  const order = useStore((s) => s.photoOrder);
  const style = useStore((s) => s.doc!.style);
  const choices = useMemo(() => startChoices(order.map((id) => photos[id].w / photos[id].h), style), [order, photos, style]);

  const [vw, setVw] = useState(() => Math.min(window.innerWidth, 560));
  useEffect(() => {
    const on = () => setVw(Math.min(window.innerWidth, 560));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const longSide = Math.round(Math.min(vw * 0.72, 340));

  return (
    <div className="start">
      <button className="icon start-back" onClick={onBack} aria-label="Back">
        <ChevronLeft size={24} />
      </button>
      <div className="start-list">
        {choices.map((c) => (
          <Preview
            key={`${c.ratio.join(':')}-${c.presetIndex}`}
            choice={c}
            longSide={longSide}
            onPick={() => useStore.getState().startWith(c.ratio, c.root, c.presetIndex)}
          />
        ))}
      </div>
    </div>
  );
}
