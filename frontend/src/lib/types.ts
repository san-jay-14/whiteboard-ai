// Shape data model — exact copy of PROJECT_BRIEF.md section 3.

// rotation is an addition beyond the literal brief section 3 type — resize/
// rotate handles (step 6) have nowhere else to persist rotation. Optional
// and degrees-based (matches Konva's node.rotation()); absent/0 means
// unrotated, so every shape created before this field existed is unaffected.
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
};

export type RectShape = ShapeBase & { type: 'rect'; width: number; height: number; fill: string; stroke: string };
export type EllipseShape = ShapeBase & { type: 'ellipse'; radiusX: number; radiusY: number; fill: string; stroke: string };
export type ArrowShape = ShapeBase & { type: 'arrow'; fromShapeId: string; toShapeId: string; points: number[] };
export type TextShape = ShapeBase & { type: 'text'; text: string; fontSize: number };
export type StrokeShape = ShapeBase & { type: 'stroke'; points: number[]; strokeWidth: number; color: string };
// width/height are also an addition beyond section 3 — sticky resize (step
// 6) needs persisted dimensions instead of the old fixed STICKY_SIZE
// constant. Always set by createSticky; no optional/fallback branches needed.
export type StickyShape = ShapeBase & { type: 'sticky'; text: string; color: string; width: number; height: number };

export type Shape = RectShape | EllipseShape | ArrowShape | TextShape | StrokeShape | StickyShape;
