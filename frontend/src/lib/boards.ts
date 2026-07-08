import { supabase } from './supabaseClient';

export type BoardListItem = {
  id: string;
  name: string;
  created_at: string;
};

export async function listMyBoards(): Promise<BoardListItem[]> {
  // RLS ("members can read boards") restricts this to boards the current
  // user is a member of — no explicit owner filter needed.
  const { data, error } = await supabase
    .from('boards')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createBoard(name: string, userId: string): Promise<BoardListItem> {
  // Generate the id client-side so we don't rely on INSERT ... RETURNING,
  // which would be hidden by the boards SELECT policy (the owner isn't a
  // member yet at the moment the board row is created).
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  const { error: boardErr } = await supabase
    .from('boards')
    .insert({ id, name, owner_id: userId, created_at });
  if (boardErr) throw boardErr;

  const { error: memberErr } = await supabase
    .from('board_members')
    .insert({ board_id: id, user_id: userId, role: 'owner' });
  if (memberErr) throw memberErr;

  return { id, name, created_at };
}
