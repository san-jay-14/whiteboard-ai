import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useBoardSession } from '../lib/BoardSessionContext';
import type { Shape } from '../lib/types';

// Render order = (z, createdAt). z is the explicit z-order key set by the
// Layers controls; shapes without one fall back to 0 and keep their
// insertion/creation order. A stable sort preserves ties.
function sortedShapes(shapes: Shape[]): Shape[] {
  return shapes.sort((a, b) => (a.z ?? 0) - (b.z ?? 0) || a.createdAt - b.createdAt);
}

// Yjs is the single source of truth for shape state — this subscribes to the
// active board's shapesMap observer instead of mirroring shapes into
// useState, so there's never a second copy to fall out of sync.
export function useShapes(): Shape[] {
  const { shapesMap } = useBoardSession();
  const cacheRef = useRef<Shape[]>(sortedShapes(Array.from(shapesMap.values())));

  const subscribe = useCallback(
    (callback: () => void) => {
      const onChange = () => {
        cacheRef.current = sortedShapes(Array.from(shapesMap.values()));
        callback();
      };
      shapesMap.observe(onChange);
      return () => shapesMap.unobserve(onChange);
    },
    [shapesMap],
  );

  const getSnapshot = useCallback(() => cacheRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}
