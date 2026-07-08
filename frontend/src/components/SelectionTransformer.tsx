import { useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';
import type Konva from 'konva';
import type * as Y from 'yjs';
import type { Shape } from '../lib/types';

const MIN_SIZE = 10;

type Props = {
  doc: Y.Doc;
  shapesMap: Y.Map<Shape>;
  shapeIds: string[];
  nodeRefs: React.RefObject<Map<string, Konva.Node>>;
  active: boolean;
};

// Wraps Konva's built-in Transformer for resize/rotate handles on selected
// rect/ellipse/sticky shapes (brief step 6 point 4) — Konva already draws
// exactly the corner-handles + above-center rotate-handle UI this needs.
export default function SelectionTransformer({ doc, shapesMap, shapeIds, nodeRefs, active }: Props) {
  const trRef = useRef<Konva.Transformer>(null);

  // No dependency array: a shape created and selected in the same render
  // has no Konva node ref yet when Canvas computes its props (refs attach
  // during commit, after render runs) — a memoized nodes list would go
  // stale. Re-syncing after every commit means it always reads refs that
  // are guaranteed already attached, at the cost of some redundant (but
  // cheap) tr.nodes() calls.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = active
      ? shapeIds.map((id) => nodeRefs.current.get(id)).filter((n): n is Konva.Node => !!n)
      : [];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  });

  function handleTransformEnd() {
    const tr = trRef.current;
    if (!tr) return;
    const transformedNodes = tr.nodes();

    doc.transact(() => {
      for (const node of transformedNodes) {
        const id = node.id();
        const shape = shapesMap.get(id);
        if (!shape) continue;

        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const rotation = node.rotation();
        const x = node.x();
        const y = node.y();
        // Konva encodes resize as a scale transform on the node — persist
        // the resulting dimensions instead and reset scale so it never
        // compounds across successive resizes (standard Konva pattern).
        node.scaleX(1);
        node.scaleY(1);

        if (shape.type === 'rect') {
          shapesMap.set(id, {
            ...shape,
            x,
            y,
            rotation,
            width: Math.max(MIN_SIZE, shape.width * scaleX),
            height: Math.max(MIN_SIZE, shape.height * scaleY),
          });
        } else if (shape.type === 'ellipse') {
          shapesMap.set(id, {
            ...shape,
            x,
            y,
            rotation,
            radiusX: Math.max(MIN_SIZE / 2, shape.radiusX * scaleX),
            radiusY: Math.max(MIN_SIZE / 2, shape.radiusY * scaleY),
          });
        } else if (shape.type === 'sticky') {
          shapesMap.set(id, {
            ...shape,
            x,
            y,
            rotation,
            width: Math.max(MIN_SIZE, shape.width * scaleX),
            height: Math.max(MIN_SIZE, shape.height * scaleY),
          });
        }
      }
    });
  }

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      resizeEnabled
      onTransformEnd={handleTransformEnd}
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox
      }
    />
  );
}
