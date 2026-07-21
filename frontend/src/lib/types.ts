// Shape data model — exact copy of PROJECT_BRIEF.md section 3.

// rotation is an addition beyond the literal brief section 3 type — resize/
// rotate handles (step 6) have nowhere else to persist rotation. Optional
// and degrees-based (matches Konva's node.rotation()); absent/0 means
// unrotated, so every shape created before this field existed is unaffected.
//
// groupId and reviewReason are step 10 additions (AI reasoning loop, brief
// section 5). groupId marks shapes an AI propose_group call decided belong
// together; reviewReason carries the tool call's `reason` so the frontend
// can show it as a tooltip on pendingReview shapes (step 11).
// Excalidraw-parity style additions (all optional with renderer-side
// defaults, so pre-existing shapes and the AI agent — which never set them —
// stay valid):
//   strokeStyle  outline dash pattern (solid/dashed/dotted)
//   strokeWidth  outline thickness for shape outlines (StrokeShape/LineShape
//                keep their own required strokeWidth)
//   edges        sharp vs rounded corners for rect/diamond
//   opacity      0–100, applied to the whole shape
//   fontFamily / textAlign  text-only typography
//   z            explicit z-order key; shapes render sorted by (z, createdAt)
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type Edges = 'sharp' | 'round';
export type FontFamily = 'hand' | 'normal' | 'code';
export type TextAlign = 'left' | 'center' | 'right';

export type ShapeBase = {
  id: string;
  type: 'rect' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'text' | 'stroke' | 'sticky' | 'image';
  x: number;
  y: number;
  origin: 'user' | 'ai';
  authorId: string;
  createdAt: number;
  pendingReview?: boolean;
  rotation?: number;
  groupId?: string;
  reviewReason?: string;
  // For AI move/update proposals: the pre-proposal values of exactly the
  // fields the proposal changed, so rejecting a modification reverts the
  // shape instead of deleting it. Absent on brand-new proposed shapes
  // (propose_connector/annotation), whose reject deletes them outright.
  reviewPrevious?: Record<string, unknown>;
  strokeStyle?: StrokeStyle;
  strokeWidth?: number;
  edges?: Edges;
  opacity?: number;
  fontFamily?: FontFamily;
  textAlign?: TextAlign;
  z?: number;
};

export type RectShape = ShapeBase & { type: 'rect'; width: number; height: number; fill: string; stroke: string };
export type EllipseShape = ShapeBase & { type: 'ellipse'; radiusX: number; radiusY: number; fill: string; stroke: string };
export type DiamondShape = ShapeBase & { type: 'diamond'; width: number; height: number; fill: string; stroke: string };
export type ArrowShape = ShapeBase & { type: 'arrow'; fromShapeId: string; toShapeId: string; points: number[] };
// A straight, free-floating line (unlike arrow, not anchored to shapes).
// points are [x1,y1,x2,y2,...] relative to (x,y), matching StrokeShape.
export type LineShape = ShapeBase & { type: 'line'; points: number[]; strokeWidth: number; color: string };
export type TextShape = ShapeBase & { type: 'text'; text: string; fontSize: number; color?: string };
export type StrokeShape = ShapeBase & { type: 'stroke'; points: number[]; strokeWidth: number; color: string };
// width/height are also an addition beyond section 3 — sticky resize (step
// 6) needs persisted dimensions instead of the old fixed STICKY_SIZE
// constant. Always set by createSticky; no optional/fallback branches needed.
export type StickyShape = ShapeBase & { type: 'sticky'; text: string; color: string; width: number; height: number };
// src is a data: URL (self-contained so snapshots/exports need no external
// fetch). width/height are the on-canvas display size.
export type ImageShape = ShapeBase & { type: 'image'; src: string; width: number; height: number };

export type Shape =
  | RectShape
  | EllipseShape
  | DiamondShape
  | ArrowShape
  | LineShape
  | TextShape
  | StrokeShape
  | StickyShape
  | ImageShape;
