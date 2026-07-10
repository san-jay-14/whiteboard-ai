import type * as Y from 'yjs';
import { getOverlayAnchor } from '../lib/geometry';
import { worldToScreen, type Viewport } from '../lib/viewport';
import type { Shape } from '../lib/types';

type Props = {
  shape: Shape;
  shapesMap: Y.Map<Shape>;
  viewport: Viewport;
};

// The "inline rationale" differentiator from step 11: full, unabbreviated
// reviewReason text on hover, not a truncated label. Anchored to the shape's
// world-space bounds, then mapped to screen px through the current viewport.
export default function ReviewTooltip({ shape, shapesMap, viewport }: Props) {
  if (!shape.reviewReason) return null;
  const bounds = getOverlayAnchor(shape, (id) => shapesMap.get(id));
  const screen = worldToScreen(viewport, bounds);

  return (
    <div
      className="pointer-events-none absolute z-30 max-w-xs rounded-lg bg-neutral-900 p-3 text-sm leading-snug text-white shadow-lg"
      style={{ left: screen.x, top: Math.max(0, screen.y - 10), transform: 'translateY(-100%)' }}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300">AI suggestion</div>
      {shape.reviewReason}
    </div>
  );
}
