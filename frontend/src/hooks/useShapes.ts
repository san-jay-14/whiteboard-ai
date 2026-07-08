import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useBoardSession } from '../lib/BoardSessionContext';
import type { Shape } from '../lib/types';

// Yjs is the single source of truth for shape state — this subscribes to the
// active board's shapesMap observer instead of mirroring shapes into
// useState, so there's never a second copy to fall out of sync.
export function useShapes(): Shape[] {
  const { shapesMap } = useBoardSession();
  const cacheRef = useRef<Shape[]>(Array.from(shapesMap.values()));

  const subscribe = useCallback(
    (callback: () => void) => {
      const onChange = () => {
        cacheRef.current = Array.from(shapesMap.values());
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
