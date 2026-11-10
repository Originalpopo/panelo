// 'row' = children sit side by side (left → right); 'col' = children stack (top → bottom).
export type Dir = 'row' | 'col';

export type Leaf = { kind: 'leaf'; id: string };
export type Split = { kind: 'split'; id: string; dir: Dir; children: LayoutNode[]; sizes: number[] };
export type LayoutNode = Leaf | Split;

/** Where a photo sits inside a cell. zoom ≥ 1 (1 = just covers the cell); ox/oy in -1..1 pick which part shows; rot = clockwise turn in degrees (0/90/180/270). */
/**
 * rot: quarter turns from the Rotate button (0/90/180/270). tilt: fine turn from a two-finger twist (degrees, ±45).
 * ox/oy: -1..1 along the photo's own sides — how far it is slid within the room it has, so it always covers the cell.
 */
export type Placement = { photoId: string | null; zoom: number; ox: number; oy: number; rot?: number; tilt?: number };

/** Sizes are in thousandths of the frame's short side, so the look is the same on screen and in the saved file. */
export type FrameStyle = {
  inner: number; // gap between cells
  outer: number; // margin around the edge
  radiusInner: number; // cell corners
  radiusOuter: number; // frame corners
  color: string; // frame colour
};

/**
 * Text on top of the frame. x/y: its centre, as a share of the frame's width / height (so it stays put when the shape changes).
 * size: letter size in thousandths of the frame's short side (same look on screen and in the saved file). rot: degrees.
 * opacity: 0..1 (missing = 1).
 */
export type TextItem = { id: string; text: string; x: number; y: number; size: number; rot: number; color: string; opacity?: number };

export type Doc = {
  ratio: [number, number]; // width : height
  root: LayoutNode;
  cells: Record<string, Placement>;
  style: FrameStyle;
  texts?: TextItem[];
};

/** url = full copy (export only); preview = small copy for the screen. w/h are the full copy's size. */
export type Photo = { id: string; url: string; preview: string; w: number; h: number };
