import * as Y from 'yjs';
import type { Shape } from './types';
import { connectBoardSync } from './realtimeSync';

// Real board switching comes in a later step — one hardcoded board for now.
export const BOARD_ID = '00000000-0000-0000-0000-000000000001';

// Single Y.Doc for the open board. Yjs is the only source of truth for
// shape state; Supabase Realtime Broadcast (per brief section 4) relays
// updates between peers but never holds authoritative state itself.
export const ydoc = new Y.Doc();

// Top-level Y.Map<Shape> keyed by shape.id, per brief section 3.
export const shapesMap: Y.Map<Shape> = ydoc.getMap('shapes');

connectBoardSync(ydoc, BOARD_ID);
