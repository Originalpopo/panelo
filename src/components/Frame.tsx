import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, RotateCw, Images, Trash2 } from 'lucide-react';
import { useStore, emptyPlacement } from '../store.ts';
import { clamp, computeLayout, photoRect, sideways, type DividerRect } from '../geometry.ts';
import { findNode, setSizes } from '../layout.ts';
import { mergeCells } from '../merge.ts';
import type { Placement } from '../types.ts';

type Gesture =
  | { mode: 'none' }
  // fixed: the finger is on a photo that isn't picked — it can't be moved, only tapped
  | { mode: 'pan'; cellId: string; x0: number; y0: number; start: Placement; moved: boolean; fixed?: boolean }
  | { mode: 'pinch'; cellId: string; d0: number; start: Placement }
  | { mode: 'divider'; div: DividerRect; x0: number; y0: number; sizes0: number[] }
  | { mode: 'mergeDrag'; from: string; over: string | null; x0: number; y0: number; moved: boolean }
  // long-press lifted a photo; it follows the finger and swaps with the cell it is dropped on
  | { mode: 'lift'; from: string; x0: number; y0: number; over: string | null };

const TAP_SLOP = 6;
const DOUBLE_TAP_MS = 320;
const LIFT_MS = 380;
const MIN_CELL_PX = 28;

export default function Frame({
  showHandles,
  mergeMode,
  photoTools,
  onPickForCell,
}: {
  showHandles: boolean;
  mergeMode: boolean;
  /** Main screen and layout › add: tap a photo to pick it — bar, move, zoom, double-tap reset. */
  photoTools: boolean;
  onPickForCell: (cellId: string) => void;
}) {
  const doc = useStore((s) => s.doc)!;
  const photos = useStore((s) => s.photos);
  const selected = useStore((s) => s.selected);
  const second = useStore((s) => s.second);
  /** Cells that will disappear if the merge drag is released now. */
  const [doomed, setDoomed] = useState<string[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const [rw, rh] = doc.ratio;
  const pad = 16;
  const availW = Math.max(0, box.w - pad * 2);
  const availH = Math.max(0, box.h - pad * 2);
  const W = Math.floor(Math.min(availW, (availH * rw) / rh));
  const H = Math.floor((W * rh) / rw);

  const layout = useMemo(() => computeLayout(doc.root, W, H, doc.style), [doc.root, doc.style, W, H]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ mode: 'none' });
  const lastTap = useRef({ id: '', t: 0 });
  const liftTimer = useRef<number | undefined>(undefined);
  /** The photo being carried for a swap: where the finger has moved it, and the cell under the finger. */
  const [lift, setLift] = useState<{ id: string; dx: number; dy: number; over: string | null } | null>(null);
  const stopLiftTimer = () => window.clearTimeout(liftTimer.current);

  // Stop iOS from scrolling/zooming the page while working on the frame.
  useEffect(() => {
    const el = stageRef.current!;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const cellRect = (id: string) => layoutRef.current.cells.find((c) => c.id === id);

  const tapCell = (cellId: string) => {
    const s = useStore.getState();
    const d = s.doc!;
    // Tap a photo to pick it (bar appears; tap again or another photo to leave it).
    // Double-tap puts it back to its smallest size, centred. An empty cell gets the bar too (add / delete).
    if (photoTools) {
      const now = Date.now();
      const last = lastTap.current;
      lastTap.current = { id: cellId, t: now };
      if (last.id === cellId && now - last.t < DOUBLE_TAP_MS) {
        lastTap.current = { id: '', t: 0 };
        s.commit((doc) => ({ ...doc, cells: { ...doc.cells, [cellId]: { ...doc.cells[cellId], zoom: 1, ox: 0, oy: 0 } } }));
        return s.select(cellId);
      }
      return s.select(s.selected === cellId ? null : cellId);
    }
    // Other menus don't pick photos; a tap only fills an empty cell.
    if (!d.cells[cellId]?.photoId) onPickForCell(cellId);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone — nothing to capture */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = useStore.getState().doc!;
    const g = gesture.current;

    if (pointers.current.size === 1) {
      const t = e.target as HTMLElement;
      const dv = t.closest<HTMLElement>('[data-divider]');
      if (dv) {
        const div = layoutRef.current.dividers[Number(dv.dataset.divider)];
        const node = findNode(d.root, div.splitId);
        if (div && node?.kind === 'split') {
          gesture.current = { mode: 'divider', div, x0: e.clientX, y0: e.clientY, sizes0: node.sizes };
          return;
        }
      }
      const ce = t.closest<HTMLElement>('[data-cell]');
      if (ce && mergeMode) {
        // merge: press a cell, slide onto the cell beside / above / below it, let go.
        gesture.current = { mode: 'mergeDrag', from: ce.dataset.cell!, over: null, x0: e.clientX, y0: e.clientY, moved: false };
      } else if (ce) {
        const cellId = ce.dataset.cell!;
        // Photos move / zoom only once picked on the main screen or in add; elsewhere they stay put.
        const fixed = !photoTools || useStore.getState().selected !== cellId;
        gesture.current = { mode: 'pan', cellId, x0: e.clientX, y0: e.clientY, start: d.cells[cellId], moved: false, fixed };
        // Hold still on a photo and it lifts up, ready to be dragged onto another cell to swap.
        if (d.cells[cellId]?.photoId) {
          stopLiftTimer();
          liftTimer.current = window.setTimeout(() => {
            const g2 = gesture.current;
            if (g2.mode !== 'pan' || g2.cellId !== cellId || g2.moved || pointers.current.size !== 1) return;
            gesture.current = { mode: 'lift', from: cellId, x0: g2.x0, y0: g2.y0, over: null };
            useStore.getState().select(null);
            setLift({ id: cellId, dx: 0, dy: 0, over: null });
          }, LIFT_MS);
        }
      } else gesture.current = { mode: 'none' };
    } else if (pointers.current.size === 2) stopLiftTimer();
    if (pointers.current.size === 2 && ((g.mode === 'pan' && !g.fixed) || g.mode === 'pinch')) {
      const [p1, p2] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', cellId: g.cellId, d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), start: d.cells[g.cellId] };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const s = useStore.getState();

    if (g.mode === 'pan') {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      g.moved = true;
      stopLiftTimer();
      if (g.fixed) return;
      const photo = g.start?.photoId ? s.photos[g.start.photoId] : undefined;
      const cell = cellRect(g.cellId);
      if (!photo || !cell) return;
      const r = photoRect(cell, photo.w, photo.h, g.start);
      const slackX = r.w - cell.w;
      const slackY = r.h - cell.h;
      const ox = slackX > 0.5 ? clamp(g.start.ox - (2 * dx) / slackX, -1, 1) : 0;
      const oy = slackY > 0.5 ? clamp(g.start.oy - (2 * dy) / slackY, -1, 1) : 0;
      s.commit((d) => ({ ...d, cells: { ...d.cells, [g.cellId]: { ...d.cells[g.cellId], ox, oy } } }), 'pan:' + g.cellId);
    } else if (g.mode === 'pinch') {
      if (pointers.current.size < 2 || !g.start?.photoId) return;
      const [p1, p2] = [...pointers.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const zoom = clamp((g.start.zoom * dist) / Math.max(1, g.d0), 1, 6);
      s.commit((d) => ({ ...d, cells: { ...d.cells, [g.cellId]: { ...d.cells[g.cellId], zoom } } }), 'zoom:' + g.cellId);
    } else if (g.mode === 'mergeDrag') {
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP) return;
      if (!g.moved) {
        g.moved = true;
        s.select(g.from);
      }
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]')?.dataset.cell ?? null;
      if (hit === g.over) return;
      // Only a neighbour (left / right / above / below) that gives a clean layout can take the merge.
      const plan = hit && hit !== g.from ? mergeCells(s.doc!.root, g.from, hit) : null;
      g.over = plan ? hit : null;
      setDoomed(plan ? plan.removed : []);
    } else if (g.mode === 'lift') {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]')?.dataset.cell ?? null;
      g.over = hit && hit !== g.from ? hit : null;
      setLift({ id: g.from, dx: e.clientX - g.x0, dy: e.clientY - g.y0, over: g.over });
    } else if (g.mode === 'divider') {
      const { div } = g;
      const delta = div.dir === 'row' ? e.clientX - g.x0 : e.clientY - g.y0;
      const i = div.index;
      const a = g.sizes0[i];
      const b = g.sizes0[i + 1];
      const minF = Math.min((a + b) / 2, MIN_CELL_PX / Math.max(1, div.avail));
      const na = clamp(a + delta / Math.max(1, div.avail), minF, a + b - minF);
      const sizes = [...g.sizes0];
      sizes[i] = na;
      sizes[i + 1] = a + b - na;
      s.commit((d) => ({ ...d, root: setSizes(d.root, div.splitId, sizes) }), `div:${div.splitId}:${i}`);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    stopLiftTimer();
    const g = gesture.current;
    if (g.mode === 'lift') {
      // Dropped on another cell: the two swap photos (each keeps its zoom, position and turn).
      const { from, over } = g;
      if (over) useStore.getState().commit((d) => ({ ...d, cells: { ...d.cells, [from]: d.cells[over], [over]: d.cells[from] } }));
      setLift(null);
    }
    if (g.mode === 'pan' && !g.moved && pointers.current.size === 0) tapCell(g.cellId);
    if (g.mode === 'mergeDrag' && pointers.current.size === 0) {
      const s = useStore.getState();
      if (!g.moved) tapCell(g.from);
      else if (g.over) {
        const { from, over } = g;
        const plan = mergeCells(s.doc!.root, from, over);
        if (plan)
          s.commit((d) => {
            const cells = { ...d.cells };
            plan.removed.forEach((id) => delete cells[id]);
            return { ...d, root: plan.root, cells };
          });
      }
      setDoomed([]);
      s.select(null);
    }
    if (pointers.current.size === 0) {
      gesture.current = { mode: 'none' };
    } else if (g.mode === 'pinch' && pointers.current.size === 1) {
      // One finger lifted: carry on as a drag from where the other finger is.
      const [p] = [...pointers.current.values()];
      const start = useStore.getState().doc!.cells[g.cellId];
      gesture.current = { mode: 'pan', cellId: g.cellId, x0: p.x, y0: p.y, start, moved: true };
    }
  };

  // The system took the touch away (e.g. an iOS gesture): drop the gesture without merging.
  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    stopLiftTimer();
    setLift(null);
    if (gesture.current.mode === 'mergeDrag') {
      setDoomed([]);
      useStore.getState().select(null);
    }
    if (pointers.current.size === 0) gesture.current = { mode: 'none' };
  };

  const st = doc.style;
  const k = layout.k;
  const shadow = st.shadow > 0 && st.shadowOpacity > 0 ? `0 0 ${st.shadow * k}px rgba(0,0,0,${st.shadowOpacity})` : 'none';

  // Floating toolbar over the tapped photo (add menu): turn, replace, delete.
  const barCell = photoTools && selected && doc.cells[selected] ? layout.cells.find((c) => c.id === selected) : undefined;
  const barHasPhoto = !!(barCell && doc.cells[barCell.id]?.photoId);
  const BAR_W = 156;
  const BAR_H = 46;
  const BAR_GAP = 6;
  // Above the photo if it fits inside the frame, else below it; only a photo as tall as the frame gets the bar on top of it.
  const barTop = (c: { y: number; h: number }) => {
    if (c.y - BAR_GAP - BAR_H >= 0) return c.y - BAR_GAP - BAR_H;
    if (c.y + c.h + BAR_GAP + BAR_H <= H) return c.y + c.h + BAR_GAP;
    return c.y + BAR_GAP;
  };

  return (
    <div
      className="stage"
      ref={stageRef}
      onPointerDown={(e) => {
        // tapping the black space around the frame leaves the picked photo
        if (photoTools && e.target === e.currentTarget) useStore.getState().select(null);
      }}
    >
      <div className="frame-wrap" style={{ width: W, height: H }}>
      <div
        className="frame"
        style={{ width: W, height: H, background: st.color, borderRadius: st.radiusOuter * k }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {layout.cells.map((c) => {
          const p = doc.cells[c.id];
          const photo = p?.photoId ? photos[p.photoId] : undefined;
          const r = photo && p ? photoRect({ x: 0, y: 0, w: c.w, h: c.h }, photo.w, photo.h, p) : null;
          const cls = ['cell', selected === c.id && 'selected', (second === c.id || doomed.includes(c.id)) && 'second', lift?.id === c.id && 'lifted', lift?.over === c.id && 'swap-target']
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={c.id}
              data-cell={c.id}
              className={cls}
              style={{
                left: c.x,
                top: c.y,
                width: c.w,
                height: c.h,
                borderRadius: Math.min(st.radiusInner * k, c.w / 2, c.h / 2),
                boxShadow: shadow,
                ...(lift?.id === c.id && { transform: `translate(${lift.dx}px, ${lift.dy}px) scale(1.06)` }),
              }}
            >
              {photo && r ? (
                <img
                  src={photo.preview}
                  alt=""
                  draggable={false}
                  style={(() => {
                    // draw at the photo's own size, then turn it about the centre of its outline
                    const [w, h] = sideways(p!) ? [r.h, r.w] : [r.w, r.h];
                    return { left: r.x + (r.w - w) / 2, top: r.y + (r.h - h) / 2, width: w, height: h, transform: `rotate(${p!.rot ?? 0}deg)` };
                  })()}
                />
              ) : (
                <div className="empty">
                  <ImagePlus size={Math.min(28, c.w / 3, c.h / 3)} />
                </div>
              )}
            </div>
          );
        })}
        {showHandles && layout.dividers.map((d, i) => {
          const horiz = d.dir === 'row';
          const cx = d.x + d.w / 2;
          const cy = d.y + d.h / 2;
          const T = 26; // finger-sized hit area, even when the gap is 0
          return (
            <div
              key={`${d.splitId}:${d.index}`}
              data-divider={i}
              className={`divider ${horiz ? 'v' : 'h'}`}
              style={horiz ? { left: cx - T / 2, top: d.y, width: T, height: d.h } : { left: d.x, top: cy - T / 2, width: d.w, height: T }}
            >
              <span className="pill" />
            </div>
          );
        })}
      </div>
      {barCell && (
        <div
          className="cell-bar"
          style={{
            left: clamp(barCell.x + barCell.w / 2 - BAR_W / 2, 0, Math.max(0, W - BAR_W)),
            top: barTop(barCell),
            width: BAR_W,
            height: BAR_H,
          }}
        >
          <button
            aria-label="Rotate"
            disabled={!barHasPhoto}
            onClick={() =>
              useStore.getState().commit((d) => ({
                ...d,
                cells: { ...d.cells, [barCell.id]: { ...d.cells[barCell.id], rot: ((d.cells[barCell.id].rot ?? 0) + 90) % 360 } },
              }))
            }
          >
            <RotateCw size={22} />
          </button>
          <button aria-label={barHasPhoto ? 'Replace photo' : 'Add photo'} onClick={() => onPickForCell(barCell.id)}>
            <Images size={22} />
          </button>
          <button
            aria-label={barHasPhoto ? 'Delete photo' : 'Delete cell'}
            onClick={() => {
              const s = useStore.getState();
              // 1st delete: the photo goes, the empty cell stays (picked). 2nd delete: the cell goes.
              if (barHasPhoto) s.commit((d) => ({ ...d, cells: { ...d.cells, [barCell.id]: emptyPlacement() } }));
              else s.removeCellRelayout(barCell.id);
            }}
          >
            <Trash2 size={22} />
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
