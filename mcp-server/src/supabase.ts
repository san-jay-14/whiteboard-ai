import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.js';
import type { ShapeGraph } from './shapes/types.js';

// Service-role client: bypasses RLS (fine for a local, single-user server
// per brief section 6), so list_boards sees every board and get_board can
// read any snapshot without a user session.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type BoardSummary = { id: string; name: string; updated_at: string };

export async function listBoards(): Promise<BoardSummary[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('id, name, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`list_boards query failed: ${error.message}`);
  return data ?? [];
}

// Returns the raw shape_graph JSON for a board, or null if no snapshot row
// exists yet.
export async function getShapeGraph(boardId: string): Promise<ShapeGraph | null> {
  const { data, error } = await supabase
    .from('board_snapshots')
    .select('shape_graph')
    .eq('board_id', boardId)
    .maybeSingle();
  if (error) throw new Error(`get_board query failed: ${error.message}`);
  if (!data) return null;
  return (data.shape_graph as ShapeGraph) ?? {};
}
