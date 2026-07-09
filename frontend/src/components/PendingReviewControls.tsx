import type * as Y from 'yjs';
import { getOverlayAnchor } from '../lib/geometry';
import type { Shape } from '../lib/types';

type Props = {
  shape: Shape;
  shapesMap: Y.Map<Shape>;
  onAccept: () => void;
  onReject: () => void;
};

// Accept/reject controls for a single selected pendingReview shape (brief
// section 5). Positioned just below the shape, in world coordinates (the
// Stage has no pan/zoom, so world coords equal screen px).
export default function PendingReviewControls({ shape, shapesMap, onAccept, onReject }: Props) {
  const bounds = getOverlayAnchor(shape, (id) => shapesMap.get(id));

  return (
    <div
      className="absolute z-30 flex gap-1 rounded-lg bg-white p-1 shadow-md"
      style={{ left: bounds.x, top: bounds.y + bounds.height + 8 }}
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
