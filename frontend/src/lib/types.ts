// Shape data model — exact copy of PROJECT_BRIEF.md section 3.

export type ShapeBase = {
  id: string;
  type: 'rect' | 'ellipse' | 'arrow' | 'text' | 'stroke' | 'sticky';
  x: number;
  y: number;
  origin: 'user' | 'ai';
  authorId: string;
  createdAt: number;
  pendingReview?: boolean;
};

export type RectShape = ShapeBase & { type: 'rect'; width: number; height: number; fill: string; stroke: string };
export type EllipseShape = ShapeBase & { type: 'ellipse'; radiusX: number; radiusY: number; fill: string; stroke: string };
export type ArrowShape = ShapeBase & { type: 'arrow'; fromShapeId: string; toShapeId: string; points: number[] };
export type TextShape = ShapeBase & { type: 'text'; text: string; fontSize: number };
export type StrokeShape = ShapeBase & { type: 'stroke'; points: number[]; strokeWidth: number; color: string };
export type StickyShape = ShapeBase & { type: 'sticky'; text: string; color: string };

export type Shape = RectShape | EllipseShape | ArrowShape | TextShape | StrokeShape | StickyShape;
