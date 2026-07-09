-- Applied to the "whiteboard" Supabase project via MCP on 2026-07-09 (step 12).
-- Fixes the ambiguous-column bug in the section-2 DDL: "where m.board_id =
-- board_id" resolved the unqualified board_id to board_members.board_id
-- (the inner table), making the check always-true (m.board_id = m.board_id)
-- and letting any member of ANY board read/write EVERY board's snapshots
-- and ops. Now that sharing (step 12) is landing, qualify explicitly.

drop policy "members can read snapshots" on board_snapshots;
create policy "members can read snapshots" on board_snapshots
  for select using (
    exists (select 1 from board_members m where m.board_id = board_snapshots.board_id and m.user_id = auth.uid())
  );

drop policy "members can write snapshots" on board_snapshots;
create policy "members can write snapshots" on board_snapshots
  for insert with check (
    exists (select 1 from board_members m where m.board_id = board_snapshots.board_id and m.user_id = auth.uid())
  );

drop policy "members can update snapshots" on board_snapshots;
create policy "members can update snapshots" on board_snapshots
  for update using (
    exists (select 1 from board_members m where m.board_id = board_snapshots.board_id and m.user_id = auth.uid())
  );

drop policy "members can read ops" on board_ops;
create policy "members can read ops" on board_ops
  for select using (
    exists (select 1 from board_members m where m.board_id = board_ops.board_id and m.user_id = auth.uid())
  );

drop policy "members can write ops" on board_ops;
create policy "members can write ops" on board_ops
  for insert with check (
    exists (select 1 from board_members m where m.board_id = board_ops.board_id and m.user_id = auth.uid())
  );
