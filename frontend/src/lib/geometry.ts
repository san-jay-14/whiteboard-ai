import type { ArrowShape, Shape } from './types';

export type Anchor = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };

// Rotates around Konva's own rotation pivot for each node type — (x,y) is
// the origin Konva itself rotates a Rect/Group (top-left) or Ellipse
// (center) around, so anchors computed this way always match the render.
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

// Unrotated bounding box in the shape's own local space. Arrow bounds use
// the shape's stored (possibly stale) points — fine for the one place this
// is used, marquee-select hit-testing, since arrow rendering itself always
// reads live endpoints separately (see getArrowEndpoints).
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

// Axis-aligned bounding box after rotation — used for marquee-select hit
// testing so a rotated shape's selection area matches what's on screen.
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

export function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Edges/corners for rect-like shapes, cardinal points for ellipses — the
// anchor set an arrow endpoint snaps to, per brief section 4/step 6.
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

export function nearestAnchor(anchors: Anchor[], point: Anchor): Anchor {
  let best = anchors[0];
  let bestDist = Infinity;
  for (const anchor of anchors) {
    const dist = (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best;
}

// Picks the closest anchor-to-anchor pair between two shapes, so a
// connector always routes via the shortest sensible edge-to-edge path.
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

// Live endpoints for a connector, recomputed from the current positions of
// its attached shapes on every call — nothing about an arrow's rendered
// line is ever baked in at creation time. Returns null if either attached
// shape is gone (caller should skip rendering / treat as orphaned).
export function getArrowEndpoints(
  shape: ArrowShape,
  getShape: (id: string) => Shape | undefined,
): { from: Anchor; to: Anchor } | null {
  const fromShape = getShape(shape.fromShapeId);
  const toShape = getShape(shape.toShapeId);
  if (!fromShape || !toShape) return null;
  return nearestAnchorPair(fromShape, toShape);
}

// Bounds for positioning UI overlays (tooltips, review controls) anchored to
// a shape — step 11. getShapeBounds's arrow case assumes points are offsets
// from shape.x/y (true for strokes), but an arrow's points are absolute
// world coordinates (see shapes.ts's createArrow), so reusing it here would
// double-count shape.x/y. Uses the live, current endpoints instead of the
// shape's own (possibly stale) points, matching what's actually rendered.
export function getOverlayAnchor(shape: Shape, getShape: (id: string) => Shape | undefined): Bounds {
  if (shape.type !== 'arrow') return getShapeBounds(shape);
  const endpoints = getArrowEndpoints(shape, getShape);
  if (!endpoints) return { x: shape.x, y: shape.y, width: 0, height: 0 };
  const xs = [endpoints.from.x, endpoints.to.x];
  const ys = [endpoints.from.y, endpoints.to.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}
