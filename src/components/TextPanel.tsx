import { useEffect, useRef, useState } from 'react';
import { PenLine, Trash2 } from 'lucide-react';
import { useStore } from '../store.ts';
import { Slider } from './BorderPanel.tsx';

/** Twelve text colours (hex, so the saved file draws exactly the same): two rows of six. */
export const TEXT_COLORS = [
  '#ffffff', '#d4d4d4', '#7a7a7a', '#000000', '#5a4e3c', '#e8e1d3',
  '#ff8904', '#ffcb47', '#e0564a', '#e77fa8', '#2f86b0', '#4f8a5b',
];

/**
 * TEXT menu, a text picked: type it again, pick a colour, or delete it.
 * Tap the colour it already has: the colours make way for an opacity slider; tap the colour dot beside it to go back.
 */
export function TextControls() {
  const sel = useStore((s) => s.textSel);
  const item = useStore((s) => s.doc?.texts?.find((t) => t.id === s.textSel));
  const [fading, setFading] = useState(false);
  useEffect(() => setFading(false), [sel]);
  if (!sel || !item) return null;
  const { editText, updateText, removeText } = useStore.getState();
  return (
    <div className="panel slim text-tools">
      <button className="icon" onClick={() => editText(sel)} aria-label="Edit text">
        <PenLine size={22} />
      </button>
      {fading ? (
        <div className="text-fade">
          <button className="sw on" style={{ background: item.color }} onClick={() => setFading(false)} aria-label="Colours" />
          <Slider label="Opacity" value={Math.round((item.opacity ?? 1) * 100)} min={10} max={100}
            onChange={(v) => updateText(sel, { opacity: v / 100 }, 'text-opacity:' + sel)} />
        </div>
      ) : (
        <div className="text-colors">
          {TEXT_COLORS.map((c) => (
            <button key={c} className={`sw ${item.color === c ? 'on' : ''}`} style={{ background: c }}
              onClick={() => (item.color === c ? setFading(true) : updateText(sel, { color: c }))} aria-label={c} />
          ))}
        </div>
      )}
      <button className="icon" onClick={() => removeText(sel)} aria-label="Delete text">
        <Trash2 size={22} />
      </button>
    </div>
  );
}

/** Typing over a dimmed screen. Done with nothing typed: a new text isn't added, an old one is removed. */
export function TextEditor() {
  const editing = useStore((s) => s.textEdit);
  const item = useStore((s) => s.doc?.texts?.find((t) => t.id === s.textEdit));
  const [value, setValue] = useState(item?.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const done = () => {
    const s = useStore.getState();
    const text = value.replace(/\s+$/, '');
    if (editing === 'new') {
      if (text.trim()) s.addText(text);
    } else if (editing) {
      if (!text.trim()) s.removeText(editing);
      else if (text !== item?.text) s.updateText(editing, { text });
    }
    s.editText(null);
  };

  return (
    <div className="text-edit" onPointerDown={(e) => e.target === e.currentTarget && done()}>
      <button className="text-done" onClick={done}>
        Done
      </button>
      <textarea ref={ref} value={value} rows={3} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}
