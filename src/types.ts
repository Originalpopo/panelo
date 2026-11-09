// 'row' = children sit side by side (left → right); 'col' = children stack (top → bottom).
export type Dir = 'row' | 'col';

export type Leaf = { kind: 'leaf'; id: string };
export type Split = { kind: 'split'; id: string; dir: Dir; children: LayoutNode[]; sizes: number[] };
export type LayoutNode = Leaf | Split;

/** Where a photo sits inside a cell. zoom ≥ 1 (1 = just covers the cell); ox/oy in -1..1 pick which part shows; rot = clockwise turn in degrees (0/90/180/270). */
export type Placement = { photoId: string | null; zoom: number; ox: number; oy: number; rot?: number };

/** Sizes are in thousandths of the frame's short side, so the look is the same on screen and in the saved file. */
export type FrameStyle = {
  inner: number; // gap between cells
  outer: number; // margin around the edge
  radiusInner: number; // cell corners
  radiusOuter: number; // frame corners
  color: string; // frame colour
  shadow: number; // cell shadow blur
  shadowOpacity: number; // 0..1
};

export type Doc = {
  ratio: [number, number]; // width : height
  root: LayoutNode;
  cells: Record<string, Placement>;
  style: FrameStyle;
};

/** url = full copy (export only); preview = small copy for the screen. w/h are the full copy's size. */
export type Photo = { id: string; url: string; preview: string; w: number; h: number };
