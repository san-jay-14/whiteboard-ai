import type * as Y from 'yjs';
import { getOverlayAnchor } from '../lib/geometry';
import type { Shape } from '../lib/types';

type Props = {
  shape: Shape;
  shapesMap: Y.Map<Shape>;
};

// The "inline rationale" differentiator from step 11: full, unabbreviated
// reviewReason text on hover, not a truncated label. Positioned in world
// coordinates — the Stage has no pan/zoom, so world coords equal screen px.
export default function ReviewTooltip({ shape, shapesMap }: Props) {
  if (!shape.reviewReason) return null;
  const bounds = getOverlayAnchor(shape, (id) => shapesMap.get(id));

  return (
    <div
      className="pointer-events-none absolute z-30 max-w-xs rounded-lg bg-neutral-900 p-3 text-sm leading-snug text-white shadow-lg"
      style={{ left: bounds.x, top: Math.max(0, bounds.y - 10), transform: 'translateY(-100%)' }}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300">AI suggestion</div>
      {shape.reviewReason}
    </div>
  );
}
