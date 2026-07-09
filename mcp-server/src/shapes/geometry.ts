// Minimal geometry port from frontend/src/lib/geometry.ts — only what the
// server-side renderer needs to place shapes and route connectors the same
// way the Konva layer does.
import type { Shape, ShapeGraph } from './types.js';

export type Anchor = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };

// Rotates around the same pivot Konva uses per node type: top-left (x,y) for
// rect/sticky, center (x,y) for ellipse.
export function rotatePoint(point: Anchor, origin: Anchor, degrees: number): Anchor {
  if (!degrees) return point;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

// Unrotated bounding box in the shape's own local space.
export function getShapeBounds(shape: Shape): Bounds {
  switch (shape.type) {
    case 'rect':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case 'ellipse':
      return {
        x: shape.x - shape.radiusX,
        y: shape.y - shape.radiusY,
        width: shape.radiusX * 2,
        height: shape.radiusY * 2,
      };
    case 'sticky':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case 'text': {
      const width = Math.max(20, shape.text.length * shape.fontSize * 0.55);
      const height = shape.fontSize * 1.3;
      return { x: shape.x, y: shape.y, width, height };
    }
    case 'stroke':
    case 'arrow': {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      const minX = xs.length ? Math.min(...xs) : 0;
      const maxX = xs.length ? Math.max(...xs) : 0;
      const minY = ys.length ? Math.min(...ys) : 0;
      const maxY = ys.length ? Math.max(...ys) : 0;
      return {
        x: shape.x + minX,
        y: shape.y + minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
  }
}

// Axis-aligned box after rotation, for framing the rendered image.
export function getRotatedAABB(shape: Shape): Bounds {
  const bounds = getShapeBounds(shape);
  const rotation = shape.rotation ?? 0;
  if (!rotation) return bounds;
  const origin = { x: shape.x, y: shape.y };
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((p) => rotatePoint(p, origin, rotation));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

// Edges/corners for rect-like shapes, cardinal points for ellipses.
export function getShapeAnchors(shape: Shape): Anchor[] {
  const rotation = shape.rotation ?? 0;
  const origin = { x: shape.x, y: shape.y };

  let local: Anchor[];
  if (shape.type === 'ellipse') {
    local = [
      { x: shape.x, y: shape.y - shape.radiusY },
      { x: shape.x + shape.radiusX, y: shape.y },
      { x: shape.x, y: shape.y + shape.radiusY },
      { x: shape.x - shape.radiusX, y: shape.y },
    ];
  } else {
    const b = getShapeBounds(shape);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    local = [
      { x: b.x, y: b.y },
      { x: cx, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x, y: cy },
      { x: b.x + b.width, y: cy },
      { x: b.x, y: b.y + b.height },
      { x: cx, y: b.y + b.height },
      { x: b.x + b.width, y: b.y + b.height },
    ];
  }

  if (!rotation) return local;
  return local.map((p) => rotatePoint(p, origin, rotation));
}

// Closest anchor-to-anchor pair between two shapes.
export function nearestAnchorPair(a: Shape, b: Shape): { from: Anchor; to: Anchor } {
  const anchorsA = getShapeAnchors(a);
  const anchorsB = getShapeAnchors(b);
  let best = { from: anchorsA[0], to: anchorsB[0] };
  let bestDist = Infinity;
  for (const from of anchorsA) {
    for (const to of anchorsB) {
      const dist = (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = { from, to };
      }
    }
  }
  return best;
}

// Live connector endpoints, recomputed from attached shapes — mirrors the
// frontend, which never trusts an arrow's stored points. Null if either end
// is missing.
export function getArrowEndpoints(
  shape: Extract<Shape, { type: 'arrow' }>,
  graph: ShapeGraph,
): { from: Anchor; to: Anchor } | null {
  const fromShape = graph[shape.fromShapeId];
  const toShape = graph[shape.toShapeId];
  if (!fromShape || !toShape) return null;
  return nearestAnchorPair(fromShape, toShape);
}
