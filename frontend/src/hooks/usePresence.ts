import { useSyncExternalStore } from 'react';
import { useBoardSession } from '../lib/BoardSessionContext';
import type { PresencePeer } from '../lib/realtimeSync';

export function usePresence(): PresencePeer[] {
  const { boardSync } = useBoardSession();
  return useSyncExternalStore(boardSync.subscribePresence, boardSync.getPresenceSnapshot);
}
