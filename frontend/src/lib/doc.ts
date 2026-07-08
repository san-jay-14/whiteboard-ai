import * as Y from 'yjs';
import type { Shape } from './types';

// Single local, in-memory Y.Doc for this session. Network sync (Supabase
// Realtime Broadcast) is wired up in a later step — this is intentionally
// the only source of truth for shape state until then.
export const ydoc = new Y.Doc();

// Top-level Y.Map<Shape> keyed by shape.id, per brief section 3.
export const shapesMap: Y.Map<Shape> = ydoc.getMap('shapes');
