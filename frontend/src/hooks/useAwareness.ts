import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { useBoardSession } from '../lib/BoardSessionContext';

export type RemotePeer = {
  clientID: number;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
};

function computeRemotePeers(awareness: Awareness): RemotePeer[] {
  const peers: RemotePeer[] = [];
  awareness.getStates().forEach((state, clientID) => {
    if (clientID === awareness.clientID) return; // exclude local
    if (!state || typeof state.name !== 'string' || typeof state.color !== 'string') return;
    peers.push({ clientID, name: state.name, color: state.color, cursor: state.cursor ?? null });
  });
  return peers;
}

// Read-through view of remote peers' awareness (cursor/name/color) for the
// active board — subscribes to the Awareness instance's own 'change' event
// rather than duplicating peer state into React state.
export function useAwareness(): RemotePeer[] {
  const { awareness } = useBoardSession();
  const cacheRef = useRef<RemotePeer[]>(computeRemotePeers(awareness));

  const subscribe = useCallback(
    (callback: () => void) => {
      const onChange = () => {
        cacheRef.current = computeRemotePeers(awareness);
        callback();
      };
      awareness.on('change', onChange);
      return () => awareness.off('change', onChange);
    },
    [awareness],
  );

  const getSnapshot = useCallback(() => cacheRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}
