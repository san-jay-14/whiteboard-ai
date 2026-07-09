import * as Y from 'yjs';
import { supabase } from './supabaseClient';
import { bytesToByteaHex, byteaHexToBytes } from '../../../shared/bytea';
import type { Shape } from './types';

const DEBOUNCE_MS = 3000;
const OPS_THRESHOLD = 50;

// Latest materialized Yjs state for a board, or null if none written yet.
export async function fetchLatestSnapshot(boardId: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from('board_snapshots')
    .select('yjs_state')
    .eq('board_id', boardId)
    .maybeSingle();
  if (error) throw error;
  const raw = data?.yjs_state as string | undefined;
  if (!raw) return null;
  return byteaHexToBytes(raw);
}

async function writeSnapshot(doc: Y.Doc, shapesMap: Y.Map<Shape>, boardId: string): Promise<void> {
  const yjsState = Y.encodeStateAsUpdate(doc);
  // shape_graph is the denormalized JSON copy of the shape map (brief
  // section 2) so the MCP server / AI agent never decode Yjs binary.
  const shapeGraph = shapesMap.toJSON();
  const { error } = await supabase.from('board_snapshots').upsert(
    {
      board_id: boardId,
      yjs_state: bytesToByteaHex(yjsState),
      shape_graph: shapeGraph,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'board_id' },
  );
  if (error) {
    // Non-fatal: a failed snapshot write just means the next debounce/flush
    // retries. Persistence isn't the live source of truth (Realtime is).
    console.error('snapshot write failed', error);
  }
}

export type SnapshotWriter = {
  // Fire-and-forget flush of any pending changes (board switch / unload).
  flush: () => void;
  stop: () => void;
};

// Writes a snapshot after ~3s of inactivity OR every ~50 ops, whichever
// comes first (brief section 4). Counts both local and remote updates, so a
// board that's only receiving remote edits still gets persisted.
export function startSnapshotWriter(doc: Y.Doc, shapesMap: Y.Map<Shape>, boardId: string): SnapshotWriter {
  let opsSinceWrite = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const write = () => {
    if (stopped) return;
    opsSinceWrite = 0;
    clearTimer();
    void writeSnapshot(doc, shapesMap, boardId);
  };

  const onUpdate = () => {
    if (stopped) return;
    opsSinceWrite += 1;
    if (opsSinceWrite >= OPS_THRESHOLD) {
      write();
      return;
    }
    clearTimer();
    timer = setTimeout(write, DEBOUNCE_MS);
  };

  doc.on('update', onUpdate);

  return {
    flush() {
      if (stopped || opsSinceWrite === 0) return;
      write();
    },
    stop() {
      stopped = true;
      doc.off('update', onUpdate);
      clearTimer();
    },
  };
}
