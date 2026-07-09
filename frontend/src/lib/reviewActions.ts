import type * as Y from 'yjs';
import type { Shape } from './types';

// Accept: the shape becomes normal — still origin: 'ai' for provenance, but
// no longer flagged pending (brief section 5: "clear pendingReview on that
// shape, normal Yjs map update"). groupId is intentionally left alone: an
// accepted group membership is a permanent grouping, not a pending one.
export function acceptShape(shapesMap: Y.Map<Shape>, shape: Shape): void {
  const { pendingReview, reviewReason, ...rest } = shape;
  shapesMap.set(shape.id, rest);
}

// Reject: a propose_group shape wasn't created by the AI — it's an existing
// (possibly user-authored) shape the AI only tagged with a groupId, so
// rejecting it must undo the grouping without deleting the shape itself. A
// propose_connector/propose_annotation shape has no groupId — it's a brand
// new AI shape, so reject deletes it outright, per brief section 5.
export function rejectShape(shapesMap: Y.Map<Shape>, shape: Shape): void {
  if (shape.groupId) {
    const { groupId, pendingReview, reviewReason, ...rest } = shape;
    shapesMap.set(shape.id, rest);
  } else {
    shapesMap.delete(shape.id);
  }
}
