import type * as Y from 'yjs';
import { getOverlayAnchor } from '../lib/geometry';
import { worldToScreen, type Viewport } from '../lib/viewport';
import type { Shape } from '../lib/types';

type Props = {
  shape: Shape;
  shapesMap: Y.Map<Shape>;
  viewport: Viewport;
  onAccept: () => void;
  onReject: () => void;
};

// Accept/reject controls for a single selected pendingReview shape (brief
// section 5). Positioned just below the shape; the shape's world-space bounds
// are mapped to screen px through the current viewport.
export default function PendingReviewControls({ shape, shapesMap, viewport, onAccept, onReject }: Props) {
  const bounds = getOverlayAnchor(shape, (id) => shapesMap.get(id));
  const screen = worldToScreen(viewport, bounds);

  return (
    <div
      className="absolute z-30 flex gap-1 rounded-lg bg-white p-1 shadow-md"
      style={{ left: screen.x, top: screen.y + bounds.height * viewport.scale + 8 }}
    >
      <button
        type="button"
        onClick={onAccept}
        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        ✓ Accept
      </button>
      <button
        type="button"
        onClick={onReject}
        className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
      >
        ✕ Reject
      </button>
    </div>
  );
}
