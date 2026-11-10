import { useRef } from 'react';
import { useStore } from '../store.ts';
import { clamp } from '../geometry.ts';
import type { TextItem } from '../types.ts';

const TAP_SLOP = 6;
const SIZE_MIN = 20;
const SIZE_MAX = 600;
/** One shared empty list, so the store picker returns the same thing each time (a fresh [] would re-render forever). */
const NO_TEXTS: TextItem[] = [];

/** id: the text being worked on (null: none picked). bg: the gesture started on the frame, not on a text. */
type Gesture = { id: string | null; bg: boolean; x0: number; y0: number; start: TextItem | null; moved: boolean; d0?: number; a0?: number };

/**
 * Texts over the frame (W×H on screen). Only in the TEXT menu (live) can they be touched, and then the photos
 * under them can't (no Cell bar, no swap): a see-through sheet covers the frame and catches every touch.
 * On a text: drag = move, tap = pick, tap the picked one = type it again.
 * Two fingers anywhere on the frame (once a text is picked, or starting on one) = size + turn that text.
 * Tap the frame = drop the pick.
 */
export default function TextLayer({ W, H, live }: { W: number; H: number; live: boolean }) {
  const texts = useStore((s) => s.doc?.texts ?? NO_TEXTS);
  const sel = useStore((s) => s.textSel);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<Gesture | null>(null);
  const short = Math.min(W, H);

  const current = (id: string) => useStore.getState().doc?.texts?.find((t) => t.id === id);

  const down = (e: React.PointerEvent, t: TextItem | null) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const id = t ? t.id : useStore.getState().textSel;
      g.current = { id, bg: !t, x0: e.clientX, y0: e.clientY, start: id ? current(id) ?? null : null, moved: false };
    } else if (pointers.current.size === 2 && g.current?.id) {
      const [p1, p2] = [...pointers.current.values()];
      g.current = { ...g.current, start: current(g.current.id) ?? g.current.start, moved: true, d0: Math.hypot(p2.x - p1.x, p2.y - p1.y), a0: Math.atan2(p2.y - p1.y, p2.x - p1.x) };
      if (useStore.getState().textSel !== g.current.id) useStore.getState().pickText(g.current.id);
    } else if (g.current) g.current.moved = true;
  };

  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !g.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gs = g.current;
    const s = useStore.getState();
    if (!gs.id || !gs.start) return;
    if (gs.d0 != null && gs.a0 != null) {
      if (pointers.current.size < 2) return;
      const [p1, p2] = [...pointers.current.values()];
      const size = clamp((gs.start.size * Math.hypot(p2.x - p1.x, p2.y - p1.y)) / Math.max(1, gs.d0), SIZE_MIN, SIZE_MAX);
      let turn = ((Math.atan2(p2.y - p1.y, p2.x - p1.x) - gs.a0) * 180) / Math.PI;
      turn = ((turn + 540) % 360) - 180;
      let rot = ((gs.start.rot + turn + 540) % 360) - 180;
      if (Math.abs(rot) < 2) rot = 0; // snaps straight
      s.updateText(gs.id, { size, rot }, 'text:' + gs.id);
      return;
    }
    const dx = e.clientX - gs.x0;
    const dy = e.clientY - gs.y0;
    if (!gs.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    gs.moved = true;
    if (gs.bg) return; // one finger on the frame doesn't move anything
    if (s.textSel !== gs.id) s.pickText(gs.id);
    s.updateText(gs.id, { x: clamp(gs.start.x + dx / W, 0, 1), y: clamp(gs.start.y + dy / H, 0, 1) }, 'text:' + gs.id);
  };

  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const gs = g.current;
    if (!gs) return;
    if (pointers.current.size === 0) {
      if (!gs.moved) {
        const s = useStore.getState();
        if (gs.bg) s.pickText(null);
        else if (s.textSel === gs.id) s.editText(gs.id);
        else s.pickText(gs.id);
      }
      g.current = null;
    } else if (pointers.current.size === 1 && gs.id) {
      // one finger lifted after a two-finger turn: the other one only drags if it is on the text
      const [p] = [...pointers.current.values()];
      g.current = { id: gs.id, bg: gs.bg, x0: p.x, y0: p.y, start: current(gs.id) ?? gs.start, moved: true };
    }
  };

  const cancel = (e: React.PointerEvent) => {
    if (g.current) g.current.moved = true; // taken away by the system: not a tap
    up(e);
  };

  // Handles on the picked text: the knob on top turns it, a corner dot sizes it (both with one finger or the mouse).
  const handle = useRef<{ kind: 'turn' | 'size'; id: string; cx: number; cy: number; a0: number; d0: number; start: TextItem } | null>(null);
  const handleDown = (e: React.PointerEvent, kind: 'turn' | 'size', t: TextItem) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const box = (e.currentTarget as HTMLElement).closest('.text-item')!.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    handle.current = { kind, id: t.id, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), d0: Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)), start: t };
  };
  const handleMove = (e: React.PointerEvent) => {
    const h = handle.current;
    if (!h) return;
    const s = useStore.getState();
    if (h.kind === 'turn') {
      const turn = ((Math.atan2(e.clientY - h.cy, e.clientX - h.cx) - h.a0) * 180) / Math.PI;
      let rot = ((h.start.rot + turn + 540) % 360) - 180;
      rot = ((rot + 540) % 360) - 180;
      if (Math.abs(rot) < 2) rot = 0; // snaps straight
      s.updateText(h.id, { rot }, 'text:' + h.id);
    } else {
      const size = clamp((h.start.size * Math.hypot(e.clientX - h.cx, e.clientY - h.cy)) / h.d0, SIZE_MIN, SIZE_MAX);
      s.updateText(h.id, { size }, 'text:' + h.id);
    }
  };
  const handleUp = () => {
    handle.current = null;
  };
  const handleProps = (kind: 'turn' | 'size', t: TextItem) => ({
    onPointerDown: (e: React.PointerEvent) => handleDown(e, kind, t),
    onPointerMove: handleMove,
    onPointerUp: handleUp,
    onPointerCancel: handleUp,
  });

  const place = (t: TextItem) => ({
    left: t.x * W,
    top: t.y * H,
    fontSize: (t.size * short) / 1000,
    transform: `translate(-50%, -50%) rotate(${t.rot}deg)`,
  });
  const picked = live ? texts.find((t) => t.id === sel) : undefined;

  if (!texts.length && !live) return null;
  return (
    <>
      <div className={`texts ${live ? 'live' : ''}`}>
        {live && <div className="text-catch" onPointerDown={(e) => down(e, null)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} />}
        {texts.map((t) => (
          <div
            key={t.id}
            className="text-item"
            style={{ ...place(t), color: t.color, opacity: t.opacity ?? 1 }}
            onPointerDown={(e) => live && down(e, t)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
          >
            {t.text}
          </div>
        ))}
      </div>
      {/* The picked text's box and handles sit on an unclipped layer, so they stay reachable at the frame's edge.
          The box is an invisible copy of the text, so it is exactly the text's size and turns with it. */}
      {picked && (
        <div className="text-handles">
          <div className="text-item ghost" style={place(picked)}>
            {picked.text}
            <span className="stem" />
            <span className="knob" {...handleProps('turn', picked)} aria-label="Turn" />
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <span key={c} className={`corner ${c}`} {...handleProps('size', picked)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
