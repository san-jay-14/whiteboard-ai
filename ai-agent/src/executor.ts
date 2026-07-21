import type * as Y from 'yjs';
import { getShapeBounds, nearestAnchorPair } from './shapes/geometry';
import type {
  ArrowShape,
  DiamondShape,
  EllipseShape,
  RectShape,
  Shape,
  TextShape,
} from './shapes/types';
import { UPDATABLE_FIELD_SET, type CreateShapeInput, type ToolCall } from './reasoning';

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

// Places a centered text label over a box-like shape (create_shape's optional
// `text` field). Width is estimated the same way geometry.ts sizes text.
function addLabel(
  shapesMap: Y.Map<Shape>,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  fontSize: number,
  color: string,
  reason: string,
): void {
  const approxWidth = Math.max(20, text.length * fontSize * 0.55);
  const label: TextShape = {
    ...base(x + (width - approxWidth) / 2, y + (height - fontSize * 1.3) / 2),
    type: 'text',
    text,
    fontSize,
    color,
    reviewReason: reason,
  };
  shapesMap.set(label.id, label);
}

// Builds a brand-new shape from a create_shape call. `refMap` maps the
// model's temporary refs (assigned this batch) to the real generated ids, so
// an arrow can link boxes created earlier in the same pass.
function createShape(shapesMap: Y.Map<Shape>, input: CreateShapeInput, refMap: Map<string, string>): void {
  const stroke = input.stroke ?? '#1e1e1e';
  const fill = input.fill ?? 'transparent';
  const reason = input.reason;

  switch (input.shapeType) {
    case 'rect':
    case 'diamond': {
      const x = input.x ?? 100;
      const y = input.y ?? 100;
      const width = input.width ?? 160;
      const height = input.height ?? 80;
      const shape = {
        ...base(x, y),
        type: input.shapeType,
        width,
        height,
        fill,
        stroke,
        strokeWidth: 2,
        edges: 'round' as const,
        reviewReason: reason,
      } satisfies RectShape | DiamondShape;
      shapesMap.set(shape.id, shape);
      if (input.ref) refMap.set(input.ref, shape.id);
      if (input.text) addLabel(shapesMap, x, y, width, height, input.text, input.fontSize ?? 16, stroke, reason);
      return;
    }
    case 'ellipse': {
      // x/y is the center for an ellipse (matches the shape model).
      const cx = input.x ?? 180;
      const cy = input.y ?? 140;
      const radiusX = input.radiusX ?? 80;
      const radiusY = input.radiusY ?? 50;
      const shape: EllipseShape = {
        ...base(cx, cy),
        type: 'ellipse',
        radiusX,
        radiusY,
        fill,
        stroke,
        strokeWidth: 2,
        reviewReason: reason,
      };
      shapesMap.set(shape.id, shape);
      if (input.ref) refMap.set(input.ref, shape.id);
      if (input.text) {
        addLabel(shapesMap, cx - radiusX, cy - radiusY, radiusX * 2, radiusY * 2, input.text, input.fontSize ?? 16, stroke, reason);
      }
      return;
    }
    case 'text': {
      const shape: TextShape = {
        ...base(input.x ?? 100, input.y ?? 100),
        type: 'text',
        text: input.text ?? '',
        fontSize: input.fontSize ?? 20,
        color: stroke,
        reviewReason: reason,
      };
      shapesMap.set(shape.id, shape);
      if (input.ref) refMap.set(input.ref, shape.id);
      return;
    }
    case 'arrow': {
      const fromId = input.fromShapeId ?? (input.fromRef ? refMap.get(input.fromRef) : undefined);
      const toId = input.toShapeId ?? (input.toRef ? refMap.get(input.toRef) : undefined);
      if (!fromId || !toId) return;
      const fromShape = shapesMap.get(fromId);
      const toShape = shapesMap.get(toId);
      if (!fromShape || !toShape) return;
      const { from, to } = nearestAnchorPair(fromShape, toShape);
      const arrow: ArrowShape = {
        ...base(from.x, from.y),
        type: 'arrow',
        fromShapeId: fromShape.id,
        toShapeId: toShape.id,
        points: [from.x, from.y, to.x, to.y],
        reviewReason: reason,
      };
      shapesMap.set(arrow.id, arrow);
      if (input.ref) refMap.set(input.ref, arrow.id);
      return;
    }
  }
}

// Translates one reasoning-pass tool call into a real Yjs mutation, per
// brief section 5's executor description. Ignores calls that reference
// shape ids no longer on the board (the model's view can be stale by the
// time the pass finishes) rather than throwing.
function applyToolCall(shapesMap: Y.Map<Shape>, call: ToolCall, refMap: Map<string, string>): void {
  switch (call.name) {
    case 'create_shape': {
      createShape(shapesMap, call.input, refMap);
      return;
    }
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
    case 'move_shape': {
      const shape = shapesMap.get(call.input.shapeId);
      if (!shape) return;
      // Modify in place, marking pendingReview and stashing the old position
      // so a reject reverts (the shape is user-authored — don't reassign
      // origin/authorId, and don't delete on reject).
      shapesMap.set(shape.id, {
        ...shape,
        x: call.input.x,
        y: call.input.y,
        pendingReview: true,
        reviewReason: call.input.reason,
        reviewPrevious: { x: shape.x, y: shape.y },
      });
      return;
    }
    case 'update_shape': {
      const shape = shapesMap.get(call.input.shapeId);
      if (!shape) return;
      const record = shape as unknown as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const previous: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(call.input)) {
        // Only allow-listed, actually-present fields — never id/type/origin.
        if (key === 'shapeId' || key === 'reason') continue;
        if (!UPDATABLE_FIELD_SET.has(key)) continue;
        if (!(key in record)) continue; // field doesn't apply to this shape type
        patch[key] = value;
        previous[key] = record[key];
      }
      if (Object.keys(patch).length === 0) return; // nothing valid to change
      shapesMap.set(shape.id, {
        ...shape,
        ...patch,
        pendingReview: true,
        reviewReason: call.input.reason,
        reviewPrevious: previous,
      } as Shape);
      return;
    }
  }
}

// Applies every tool call from one reasoning pass in a single Yjs
// transaction, so peers see the whole batch of proposals atomically.
export function executeToolCalls(doc: Y.Doc, shapesMap: Y.Map<Shape>, calls: ToolCall[]): void {
  if (calls.length === 0) return;
  // Shared across the batch so arrows can resolve fromRef/toRef to boxes
  // created earlier in the same pass.
  const refMap = new Map<string, string>();
  doc.transact(() => {
    for (const call of calls) {
      applyToolCall(shapesMap, call, refMap);
    }
  });
}
