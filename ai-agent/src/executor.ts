import type * as Y from 'yjs';
import { getShapeBounds, nearestAnchorPair } from './shapes/geometry';
import type { ArrowShape, Shape, TextShape } from './shapes/types';
import type { ToolCall } from './reasoning';

const AI_AUTHOR_ID = 'ai-agent';

function base(x: number, y: number) {
  return {
    id: crypto.randomUUID(),
    x,
    y,
    origin: 'ai' as const,
    authorId: AI_AUTHOR_ID,
    createdAt: Date.now(),
    pendingReview: true as const,
  };
}

// Translates one reasoning-pass tool call into a real Yjs mutation, per
// brief section 5's executor description. Ignores calls that reference
// shape ids no longer on the board (the model's view can be stale by the
// time the pass finishes) rather than throwing.
function applyToolCall(shapesMap: Y.Map<Shape>, call: ToolCall): void {
  switch (call.name) {
    case 'propose_connector': {
      const fromShape = shapesMap.get(call.input.fromShapeId);
      const toShape = shapesMap.get(call.input.toShapeId);
      if (!fromShape || !toShape) return;
      const { from, to } = nearestAnchorPair(fromShape, toShape);
      const arrow: ArrowShape = {
        ...base(from.x, from.y),
        type: 'arrow',
        fromShapeId: fromShape.id,
        toShapeId: toShape.id,
        points: [from.x, from.y, to.x, to.y],
        reviewReason: call.input.reason,
      };
      shapesMap.set(arrow.id, arrow);
      return;
    }
    case 'propose_group': {
      const shapes = call.input.shapeIds
        .map((id) => shapesMap.get(id))
        .filter((s): s is Shape => s !== undefined);
      if (shapes.length < 2) return; // nothing to group
      const groupId = crypto.randomUUID();
      for (const shape of shapes) {
        // Only the grouping fields change — geometry/style stay exactly as
        // the (possibly user-authored) shape already had them, per brief
        // step 10: "not by mutating the shapes' other properties".
        shapesMap.set(shape.id, {
          ...shape,
          origin: 'ai',
          authorId: AI_AUTHOR_ID,
          pendingReview: true,
          reviewReason: call.input.reason,
          groupId,
        });
      }
      return;
    }
    case 'propose_annotation': {
      const nearShape = shapesMap.get(call.input.nearShapeId);
      if (!nearShape) return;
      const bounds = getShapeBounds(nearShape);
      const annotation: TextShape = {
        ...base(bounds.x, bounds.y + bounds.height + 16),
        type: 'text',
        text: call.input.text,
        fontSize: 16,
      };
      shapesMap.set(annotation.id, annotation);
      return;
    }
  }
}

// Applies every tool call from one reasoning pass in a single Yjs
// transaction, so peers see the whole batch of proposals atomically.
export function executeToolCalls(doc: Y.Doc, shapesMap: Y.Map<Shape>, calls: ToolCall[]): void {
  if (calls.length === 0) return;
  doc.transact(() => {
    for (const call of calls) {
      applyToolCall(shapesMap, call);
    }
  });
}
