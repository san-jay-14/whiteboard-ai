import { useSyncExternalStore } from 'react';
import { shapesMap } from '../lib/doc';
import type { Shape } from '../lib/types';

// Yjs is the single source of truth for shape state — this hook subscribes
// to shapesMap's own observer instead of mirroring shapes into useState, so
// there's never a second copy of shape data to fall out of sync (this
// matters once step 4 adds remote peers writing into the same map).
let cachedShapes: Shape[] = Array.from(shapesMap.values());

function subscribe(callback: () => void) {
  const onChange = () => {
    cachedShapes = Array.from(shapesMap.values());
    callback();
  };
  shapesMap.observe(onChange);
  return () => shapesMap.unobserve(onChange);
}

function getSnapshot() {
  return cachedShapes;
}

export function useShapes(): Shape[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
