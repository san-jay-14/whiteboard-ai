// Viewport transform for the infinite canvas. The Konva Stage renders every
// shape in "world" coordinates; the viewport maps world → screen via a
// uniform scale (zoom) plus an (x,y) translation (pan). Shapes always store
// world coordinates, so pan/zoom never touches the shape data.

export type Viewport = { x: number; y: number; scale: number };
export type Point = { x: number; y: number };

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 30;
// Excalidraw-style discrete zoom steps for the +/- buttons and shortcuts.
export const ZOOM_STEP = 1.1;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// world → screen (CSS px relative to the Stage container's top-left).
export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y };
}

// screen → world (inverse of the above).
export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale };
}

// Zoom to a new scale while keeping the world point currently under
// `screenPoint` pinned there — the standard "zoom toward cursor" behaviour.
export function zoomAt(vp: Viewport, nextScale: number, screenPoint: Point): Viewport {
  const scale = clampScale(nextScale);
  const world = screenToWorld(vp, screenPoint);
  return {
    scale,
    x: screenPoint.x - world.x * scale,
    y: screenPoint.y - world.y * scale,
  };
}

// Zoom centred on the middle of the viewport (used by the +/- buttons).
export function zoomToCenter(vp: Viewport, nextScale: number, width: number, height: number): Viewport {
  return zoomAt(vp, nextScale, { x: width / 2, y: height / 2 });
}

// Fits a world-space bounding box into the viewport with padding, capped at
// 100% so we never zoom *in* past 1:1 when fitting a tiny selection.
export function fitBoundsToViewport(
  bounds: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  padding = 80,
): Viewport {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: width / 2 - bounds.x, y: height / 2 - bounds.y, scale: 1 };
  }
  const scale = clampScale(
    Math.min((width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height, 1),
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
}

const STORAGE_PREFIX = 'wb:viewport:';

export function loadViewport(boardId: string): Viewport {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + boardId);
    if (!raw) return DEFAULT_VIEWPORT;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.scale === 'number'
    ) {
      return { x: parsed.x, y: parsed.y, scale: clampScale(parsed.scale) };
    }
  } catch {
    // corrupt/absent storage — fall back to default
  }
  return DEFAULT_VIEWPORT;
}

export function saveViewport(boardId: string, vp: Viewport): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + boardId, JSON.stringify(vp));
  } catch {
    // storage full / unavailable — non-fatal
  }
}
