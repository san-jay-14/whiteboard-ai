import { useSyncExternalStore } from 'react';
import { awareness } from '../lib/doc';

export type RemotePeer = {
  clientID: number;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
};

// Mirrors useShapes' pattern: subscribe to the Awareness instance's own
// 'change' event rather than mirroring peer state into useState, so this
// stays a read-through view instead of a second copy that could drift.
let cachedPeers: RemotePeer[] = computeRemotePeers();

function computeRemotePeers(): RemotePeer[] {
  const peers: RemotePeer[] = [];
  awareness.getStates().forEach((state, clientID) => {
    if (clientID === awareness.clientID) return; // exclude local
    if (!state || typeof state.name !== 'string' || typeof state.color !== 'string') return;
    peers.push({ clientID, name: state.name, color: state.color, cursor: state.cursor ?? null });
  });
  return peers;
}

function subscribe(callback: () => void) {
  const onChange = () => {
    cachedPeers = computeRemotePeers();
    callback();
  };
  awareness.on('change', onChange);
  return () => awareness.off('change', onChange);
}

function getSnapshot() {
  return cachedPeers;
}

export function useAwareness(): RemotePeer[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
