// Local copy of the frontend shape model (frontend/src/lib/types.ts),
// mirroring the same standalone-copy precedent already used by
// mcp-server/src/shapes/types.ts. Kept independent so the agent builds
// without importing the frontend package; if the frontend model changes,
// mirror it here.

export type ShapeBase = {
  id: string;
  type: 'rect' | 'ellipse' | 'arrow' | 'text' | 'stroke' | 'sticky';
  x: number;
  y: number;
  origin: 'user' | 'ai';
  authorId: string;
  createdAt: number;
  pendingReview?: boolean;
  rotation?: number;
  groupId?: string;
  reviewReason?: string;
};

export type RectShape = ShapeBase & { type: 'rect'; width: number; height: number; fill: string; stroke: string };
export type EllipseShape = ShapeBase & { type: 'ellipse'; radiusX: number; radiusY: number; fill: string; stroke: string };
export type ArrowShape = ShapeBase & { type: 'arrow'; fromShapeId: string; toShapeId: string; points: number[] };
export type TextShape = ShapeBase & { type: 'text'; text: string; fontSize: number };
export type StrokeShape = ShapeBase & { type: 'stroke'; points: number[]; strokeWidth: number; color: string };
export type StickyShape = ShapeBase & { type: 'sticky'; text: string; color: string; width: number; height: number };

export type Shape = RectShape | EllipseShape | ArrowShape | TextShape | StrokeShape | StickyShape;

// Plain-JSON view of the Y.Map<Shape> the reasoning pass sends to Claude.
export type ShapeGraph = Record<string, Shape>;
