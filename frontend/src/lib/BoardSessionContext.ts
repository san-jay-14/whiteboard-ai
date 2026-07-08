import { createContext, useContext } from 'react';
import type { BoardSession } from './session';

// The active board's session, provided once a board is open. Everything
// board-scoped (shapes, awareness, presence, mutations) reads from here so
// there are no module-level singletons that would leak across board
// switches.
export const BoardSessionContext = createContext<BoardSession | null>(null);

export function useBoardSession(): BoardSession {
  const session = useContext(BoardSessionContext);
  if (!session) {
    throw new Error('useBoardSession must be used within a BoardSessionContext provider');
  }
  return session;
}
