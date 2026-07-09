import { useSyncExternalStore } from 'react';
import { useBoardSession } from '../lib/BoardSessionContext';
import type { ConnectionStatus } from '../lib/realtimeSync';

export function useConnectionStatus(): ConnectionStatus {
  const { boardSync } = useBoardSession();
  return useSyncExternalStore(boardSync.subscribeConnectionStatus, boardSync.getConnectionStatus);
}
