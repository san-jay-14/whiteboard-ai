import { ydoc, shapesMap } from './doc';

// Deletes the given shape ids plus any arrows attached to them (per brief
// section 6: "If a connected shape is deleted, delete any arrows attached
// to it too"), batched in one Yjs transaction so multi-select delete
// broadcasts as a single update instead of one per shape.
export function deleteShapesCascading(ids: string[]): void {
  const idSet = new Set(ids);
  const toDelete = new Set(ids);
  shapesMap.forEach((shape) => {
    if (shape.type === 'arrow' && (idSet.has(shape.fromShapeId) || idSet.has(shape.toShapeId))) {
      toDelete.add(shape.id);
    }
  });
  ydoc.transact(() => {
    toDelete.forEach((id) => shapesMap.delete(id));
  });
}
