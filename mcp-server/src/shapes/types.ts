// Local copy of the frontend shape model (frontend/src/lib/types.ts). The
// MCP server reads board_snapshots.shape_graph, which is the denormalized
// JSON dump of the Y.Map<Shape> — a plain object keyed by shape id.
//
// Kept as a standalone copy (not imported from the frontend package) so the
// server builds independently; if the frontend model changes, mirror it
// here. The rendering that must stay visually consistent lives in
// render/svg.ts.

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type Edges = 'sharp' | 'round';
export type FontFamily = 'hand' | 'normal' | 'code';
export type TextAlign = 'left' | 'center' | 'right';

export type ShapeBase = {
  id: string;
  type: 'rect' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'text' | 'stroke' | 'sticky';
  x: number;
  y: number;
  origin: 'user' | 'ai';
  authorId: string;
  createdAt: number;
  pendingReview?: boolean;
  rotation?: number;
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
export type LineShape = ShapeBase & { type: 'line'; points: number[]; strokeWidth: number; color: string };
export type TextShape = ShapeBase & { type: 'text'; text: string; fontSize: number; color?: string };
export type StrokeShape = ShapeBase & { type: 'stroke'; points: number[]; strokeWidth: number; color: string };
export type StickyShape = ShapeBase & { type: 'sticky'; text: string; color: string; width: number; height: number };

export type Shape =
  | RectShape
  | EllipseShape
  | DiamondShape
  | ArrowShape
  | LineShape
  | TextShape
  | StrokeShape
  | StickyShape;

// board_snapshots.shape_graph shape: keyed by shape.id.
export type ShapeGraph = Record<string, Shape>;
