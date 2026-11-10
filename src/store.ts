import { create } from 'zustand';
import type { Doc, FrameStyle, LayoutNode, Photo, Placement, TextItem } from './types.ts';
import { leafIds, presetsFor, uid } from './layout.ts';

export const DEFAULT_STYLE: FrameStyle = {
  inner: 12,
  outer: 24,
  radiusInner: 0,
  radiusOuter: 0,
  color: '#ffffff',
};

export const emptyPlacement = (photoId: string | null = null): Placement => ({ photoId, zoom: 1, ox: 0, oy: 0, rot: 0, tilt: 0 });

const HISTORY_LIMIT = 60;
const COALESCE_MS = 900;

type State = {
  doc: Doc | null;
  past: Doc[];
  future: Doc[];
  photos: Record<string, Photo>;
  photoOrder: string[];
  selected: string | null;
  /** A second picked cell next to the first one — for Merge (first one is kept) and Swap. */
  second: string | null;
  swapFrom: string | null;
  recentColors: string[];
  presetIndex: number;
  /** The text picked on the frame (TEXT menu). */
  textSel: string | null;
  /** The text being typed: an id, 'new' for one not added yet, or null. */
  textEdit: string | null;
  /** Just after the first photos are chosen: the opening screen of frame shapes is up. */
  choosing: boolean;
  lastKey: string | null;
  lastTime: number;

  /** Change the document. Repeated changes with the same key within a moment count as one undo step. */
  commit: (fn: (d: Doc) => Doc, key?: string) => void;
  undo: () => void;
  redo: () => void;
  addPhotos: (photos: Photo[], targetCell?: string | null) => void;
  /** Adds photos and re-picks a layout with room for all of them. */
  addPhotosRelayout: (photos: Photo[]) => void;
  /** Removes a cell: re-picks a layout with one cell fewer; the photos left keep their order. */
  removeCellRelayout: (cellId: string) => void;
  applyLayout: (root: LayoutNode) => void;
  select: (id: string | null) => void;
  setSecond: (id: string | null) => void;
  setSwapFrom: (id: string | null) => void;
  useColor: (c: string) => void;
  setPresetIndex: (i: number) => void;
  /** Adds a text in the middle of the frame (white, bold) and picks it. */
  addText: (text: string) => void;
  updateText: (id: string, patch: Partial<TextItem>, key?: string) => void;
  removeText: (id: string) => void;
  pickText: (id: string | null) => void;
  editText: (id: string | null) => void;
  /** Opening screen picked: use this shape and layout (not an undo step). */
  startWith: (ratio: [number, number], root: LayoutNode, presetIndex: number) => void;
  reset: () => void;
};

/** Photos in the order they currently appear, then the unused ones. */
function photoQueue(doc: Doc | null, order: string[]): string[] {
  const placed = doc
    ? leafIds(doc.root)
        .map((id) => doc.cells[id]?.photoId)
        .filter((p): p is string => !!p)
    : [];
  return [...placed, ...order.filter((p) => !placed.includes(p))];
}

/** A photo moved to a new layout keeps the way it was turned and flipped. */
function keepTurn(p: Placement, from: Doc | null): Placement {
  if (!p.photoId || !from) return p;
  const old = Object.values(from.cells).find((c) => c.photoId === p.photoId);
  return { ...p, rot: old?.rot ?? 0, tilt: old?.tilt ?? 0, flip: old?.flip ?? false };
}

export const useStore = create<State>((set, get) => ({
  doc: null,
  past: [],
  future: [],
  photos: {},
  photoOrder: [],
  selected: null,
  second: null,
  swapFrom: null,
  recentColors: [],
  presetIndex: 0,
  textSel: null,
  textEdit: null,
  choosing: false,
  lastKey: null,
  lastTime: 0,

  commit: (fn, key) => {
    const { doc, past, lastKey, lastTime } = get();
    if (!doc) return;
    const next = fn(doc);
    if (next === doc) return;
    const now = Date.now();
    const merge = key != null && key === lastKey && now - lastTime < COALESCE_MS;
    set({
      doc: next,
      past: merge ? past : [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
      lastKey: key ?? null,
      lastTime: now,
    });
  },

  undo: () => {
    const { doc, past, future } = get();
    if (!doc || past.length === 0) return;
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], lastKey: null, swapFrom: null, selected: null, second: null, textSel: null });
  },

  redo: () => {
    const { doc, past, future } = get();
    if (!doc || future.length === 0) return;
    set({ doc: future[0], past: [...past, doc], future: future.slice(1), lastKey: null, swapFrom: null, selected: null, second: null, textSel: null });
  },

  addPhotos: (incoming, targetCell) => {
    const s = get();
    const photos = { ...s.photos };
    incoming.forEach((p) => (photos[p.id] = p));
    const photoOrder = [...s.photoOrder, ...incoming.map((p) => p.id)];
    set({ photos, photoOrder });

    if (!s.doc) {
      const root = presetsFor(Math.min(incoming.length, 16))[0];
      const ids = leafIds(root);
      const cells: Record<string, Placement> = {};
      ids.forEach((id, i) => (cells[id] = emptyPlacement(incoming[i]?.id ?? null)));
      set({ doc: { ratio: [1, 1], root, cells, style: { ...DEFAULT_STYLE } }, past: [], future: [], presetIndex: 0, choosing: true });
      return;
    }

    // Fill the chosen cell first, then any empty cells, in order.
    const queue = incoming.map((p) => p.id);
    s.commit((d) => {
      const cells = { ...d.cells };
      const targets = [
        ...(targetCell ? [targetCell] : []),
        ...leafIds(d.root).filter((id) => id !== targetCell && !cells[id]?.photoId),
      ];
      for (const id of targets) {
        const pid = queue.shift();
        if (!pid) break;
        cells[id] = emptyPlacement(pid);
      }
      return { ...d, cells };
    });
  },

  addPhotosRelayout: (incoming) => {
    const s = get();
    if (!s.doc) return s.addPhotos(incoming);
    const photos = { ...s.photos };
    incoming.forEach((p) => (photos[p.id] = p));
    set({ photos, photoOrder: [...s.photoOrder, ...incoming.map((p) => p.id)] });
    // The photos already in the frame keep their order; the new ones follow. Frame ratio stays as it is.
    const placed = photoQueue(s.doc, []);
    const queue = [...placed, ...incoming.map((p) => p.id)];
    const root = presetsFor(queue.length)[0];
    const cells: Record<string, Placement> = {};
    leafIds(root).forEach((id, i) => (cells[id] = keepTurn(emptyPlacement(queue[i] ?? null), s.doc)));
    s.commit((d) => ({ ...d, root, cells }));
    set({ presetIndex: 0, selected: null, second: null, swapFrom: null });
  },

  removeCellRelayout: (cellId) => {
    const s = get();
    if (!s.doc) return;
    const gone = s.doc.cells[cellId]?.photoId;
    const queue = photoQueue(s.doc, []).filter((p) => p !== gone);
    // One cell fewer than now (other empty cells stay, at the end); never fewer than one.
    const root = presetsFor(Math.max(1, leafIds(s.doc.root).length - 1))[0];
    const cells: Record<string, Placement> = {};
    leafIds(root).forEach((id, i) => (cells[id] = keepTurn(emptyPlacement(queue[i] ?? null), s.doc)));
    s.commit((d) => ({ ...d, root, cells }));
    set({ presetIndex: 0, selected: null, second: null, swapFrom: null });
  },

  applyLayout: (root) => {
    const { doc, photoOrder } = get();
    if (!doc) return;
    const queue = photoQueue(doc, photoOrder);
    const cells: Record<string, Placement> = {};
    leafIds(root).forEach((id, i) => (cells[id] = keepTurn(emptyPlacement(queue[i] ?? null), doc)));
    get().commit((d) => ({ ...d, root, cells }));
    set({ selected: null, second: null, swapFrom: null });
  },

  select: (id) => set({ selected: id, second: null, swapFrom: null }),
  setSecond: (id) => set({ second: id }),
  setSwapFrom: (id) => set({ swapFrom: id }),
  useColor: (c) => set({ recentColors: [c, ...get().recentColors.filter((x) => x !== c)].slice(0, 8) }),
  setPresetIndex: (i) => set({ presetIndex: i }),
  addText: (text) => {
    const id = uid();
    get().commit((d) => ({ ...d, texts: [...(d.texts ?? []), { id, text, x: 0.5, y: 0.5, size: 80, rot: 0, color: '#ffffff' }] }));
    set({ textSel: id });
  },
  updateText: (id, patch, key) =>
    get().commit((d) => ({ ...d, texts: (d.texts ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }), key),
  removeText: (id) => {
    get().commit((d) => ({ ...d, texts: (d.texts ?? []).filter((t) => t.id !== id) }));
    set({ textSel: null });
  },
  pickText: (id) => set({ textSel: id }),
  editText: (id) => set({ textEdit: id }),
  startWith: (ratio, root, presetIndex) => {
    const { doc, photoOrder } = get();
    if (!doc) return;
    const cells: Record<string, Placement> = {};
    leafIds(root).forEach((id, i) => (cells[id] = emptyPlacement(photoOrder[i] ?? null)));
    set({ doc: { ...doc, ratio, root, cells }, past: [], future: [], presetIndex, choosing: false, selected: null });
  },
  reset: () => {
    Object.values(get().photos).forEach((p) => {
      URL.revokeObjectURL(p.url);
      URL.revokeObjectURL(p.preview);
    });
    set({ doc: null, past: [], future: [], photos: {}, photoOrder: [], selected: null, second: null, swapFrom: null, presetIndex: 0, choosing: false, textSel: null, textEdit: null });
  },
}));
