import type * as Y from 'yjs';
import type { Shape } from './types';

// Accept: the shape becomes normal — still origin: 'ai' for provenance, but
// no longer flagged pending (brief section 5: "clear pendingReview on that
// shape, normal Yjs map update"). groupId is intentionally left alone: an
// accepted group membership is a permanent grouping, not a pending one.
export function acceptShape(shapesMap: Y.Map<Shape>, shape: Shape): void {
  const { pendingReview, reviewReason, reviewPrevious, ...rest } = shape;
  shapesMap.set(shape.id, rest as Shape);
}

// Reject: how to undo depends on what kind of proposal this is.
//  - move/update proposal (has reviewPrevious): restore the changed fields to
//    their pre-proposal values; the shape itself stays (it's user-authored).
//  - propose_group (has groupId, no reviewPrevious): it's an existing shape
//    the AI only tagged with a groupId, so undo the grouping without deleting.
//  - propose_connector/annotation (brand-new AI shape): delete it outright,
//    per brief section 5.
export function rejectShape(shapesMap: Y.Map<Shape>, shape: Shape): void {
  if (shape.reviewPrevious) {
    const { reviewPrevious, pendingReview, reviewReason, ...rest } = shape;
    shapesMap.set(shape.id, { ...rest, ...reviewPrevious } as Shape);
  } else if (shape.groupId) {
    const { groupId, pendingReview, reviewReason, ...rest } = shape;
    shapesMap.set(shape.id, rest as Shape);
  } else {
    shapesMap.delete(shape.id);
  }
}
