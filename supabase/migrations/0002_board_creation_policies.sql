-- Applied to the "whiteboard" Supabase project via MCP on 2026-07-08 (step 7).
-- The section-2 DDL enabled RLS on boards + board_members but never defined
-- the policies needed to CREATE a board from the client: boards had only a
-- SELECT policy, and board_members had RLS on with no policies at all.
-- These additive policies let an authenticated user (including anonymous
-- auth users, who carry the 'authenticated' role) create a board they own
-- and manage their own membership rows. Existing snapshot/ops policies are
-- unchanged.

create policy "authenticated can create own boards" on boards
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "read own memberships" on board_members
  for select to authenticated
  using (user_id = auth.uid());

create policy "insert own membership" on board_members
  for insert to authenticated
  with check (user_id = auth.uid());
