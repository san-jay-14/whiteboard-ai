-- Applied to the "whiteboard" Supabase project via MCP on 2026-07-09 (step 12).
-- step 12: invite-by-email sharing. A SECURITY DEFINER function is required
-- because auth.users (and its email column) isn't exposed to PostgREST/RLS
-- for the authenticated role — the client can never look up a user by email
-- directly. This function does its own owner check, then performs the
-- lookup + insert with elevated privileges. "target_board_id" (not
-- "board_id") deliberately avoids the exact ambiguous-column shape that bit
-- the section-2 DDL.
create or replace function invite_board_member(target_board_id uuid, invitee_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitee_id uuid;
  is_owner boolean;
begin
  select exists (
    select 1 from board_members
    where board_id = target_board_id and user_id = auth.uid() and role = 'owner'
  ) into is_owner;

  if not is_owner then
    raise exception 'only the board owner can invite members';
  end if;

  select id into invitee_id from auth.users where lower(email) = lower(invitee_email);

  if invitee_id is null then
    raise exception 'no account found for %', invitee_email;
  end if;

  insert into board_members (board_id, user_id, role)
  values (target_board_id, invitee_id, 'editor')
  on conflict (board_id, user_id) do nothing;
end;
$$;

grant execute on function invite_board_member(uuid, text) to authenticated;
