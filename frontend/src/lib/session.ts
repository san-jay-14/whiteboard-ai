import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { connectBoardSync, type BoardSyncHandle } from './realtimeSync';
import { fetchLatestSnapshot, startSnapshotWriter, type SnapshotWriter } from './snapshots';
import type { LocalUser } from './identity';
import type { Shape } from './types';

// Everything tied to one open board. Recreated when the user switches
// boards (the previous session is torn down first via closeBoardSession).
export type BoardSession = {
  boardId: string;
  doc: Y.Doc;
  shapesMap: Y.Map<Shape>;
  awareness: Awareness;
  boardSync: BoardSyncHandle;
  snapshotWriter: SnapshotWriter;
};

export async function openBoardSession(boardId: string, localUser: LocalUser): Promise<BoardSession> {
  const doc = new Y.Doc();
  const shapesMap: Y.Map<Shape> = doc.getMap('shapes');

  // Load-on-join (brief section 4): backfill state from the latest snapshot
  // BEFORE any update listeners are attached, so applying it doesn't
  // re-broadcast, then subscribe to the channel for anything after this
  // point. Yjs updates are CRDT-idempotent, so overlap with channel history
  // is harmless.
  const snapshot = await fetchLatestSnapshot(boardId);
  if (snapshot) {
    Y.applyUpdate(doc, snapshot);
  }

  const awareness = new Awareness(doc);
  const boardSync = connectBoardSync(doc, awareness, boardId, localUser);
  const snapshotWriter = startSnapshotWriter(doc, shapesMap, boardId);

  return { boardId, doc, shapesMap, awareness, boardSync, snapshotWriter };
}

export function closeBoardSession(session: BoardSession): void {
  // Persist any changes still inside the debounce window before tearing down.
  session.snapshotWriter.flush();
  session.snapshotWriter.stop();
  session.boardSync.disconnect();
  session.awareness.destroy();
  session.doc.destroy();
}
