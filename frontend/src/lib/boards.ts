import { supabase } from './supabaseClient';
import type { Shape } from './types';

export type BoardListItem = {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
  // "Last updated" for the list (step 12) — sourced from board_snapshots
  // (which the debounced writer already keeps fresh on every content
  // change) rather than a second boards.updated_at write path; falls back
  // to created_at for a board that's never been saved yet.
  lastActivityAt: string;
  // Denormalized shape_graph from board_snapshots, for the list thumbnail
  // (step 12) — undefined if the board has never been opened/saved yet.
  shapeGraph?: Record<string, Shape>;
};

// RLS ("members can read boards") restricts this to boards the current user
// is a member of (owner or invited editor) — no explicit filter needed.
export async function listMyBoards(): Promise<BoardListItem[]> {
  const { data: boards, error } = await supabase.from('boards').select('id, name, created_at, owner_id');
  if (error) throw error;
  if (!boards || boards.length === 0) return [];

  // Separate query rather than a PostgREST embed: board_snapshots is 1:1 on
  // board_id but not every board has a row yet, and keeping the two shapes
  // independently typed avoids depending on embed-cardinality inference.
  const { data: snapshots, error: snapErr } = await supabase
    .from('board_snapshots')
    .select('board_id, shape_graph, updated_at')
    .in(
      'board_id',
      boards.map((b) => b.id),
    );
  if (snapErr) throw snapErr;

  const snapshotByBoardId = new Map<string, { shape_graph: Record<string, Shape>; updated_at: string }>();
  for (const row of snapshots ?? []) {
    snapshotByBoardId.set(row.board_id, { shape_graph: row.shape_graph as Record<string, Shape>, updated_at: row.updated_at });
  }

  return boards
    .map((b) => {
      const snapshot = snapshotByBoardId.get(b.id);
      return { ...b, lastActivityAt: snapshot?.updated_at ?? b.created_at, shapeGraph: snapshot?.shape_graph };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export async function createBoard(name: string, userId: string): Promise<BoardListItem> {
  // Generate the id client-side so we don't rely on INSERT ... RETURNING,
  // which would be hidden by the boards SELECT policy (the owner isn't a
  // member yet at the moment the board row is created).
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: boardErr } = await supabase.from('boards').insert({ id, name, owner_id: userId, created_at: now });
  if (boardErr) throw boardErr;

  const { error: memberErr } = await supabase
    .from('board_members')
    .insert({ board_id: id, user_id: userId, role: 'owner' });
  if (memberErr) throw memberErr;

  return { id, name, created_at: now, owner_id: userId, lastActivityAt: now };
}

// Owner-only invite by email (step 12). The lookup itself has to happen
// server-side — see supabase/migrations/0004_invite_board_member_rpc.sql —
// because auth.users isn't queryable from the client.
export async function inviteMemberByEmail(boardId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('invite_board_member', {
    target_board_id: boardId,
    invitee_email: email,
  });
  if (error) throw error;
}
