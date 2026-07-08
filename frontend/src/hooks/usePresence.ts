import { useSyncExternalStore } from 'react';
import { boardSync } from '../lib/doc';
import type { PresencePeer } from '../lib/realtimeSync';

export function usePresence(): PresencePeer[] {
  return useSyncExternalStore(boardSync.subscribePresence, boardSync.getPresenceSnapshot);
}
