-- Applied to the "whiteboard" Supabase project via MCP on 2026-07-08.
-- Source of truth: PROJECT_BRIEF.md section 2. Kept here for local reference
-- and future `supabase db` CLI workflows if needed.

create extension if not exists pgcrypto;

create table boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table board_members (
  board_id uuid references boards(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text not null default 'editor', -- 'owner' | 'editor'
  primary key (board_id, user_id)
);

-- Materialized Yjs state, debounce-written. shape_graph is a denormalized
-- JSON copy of the shape map so the MCP server and AI agent never need to
-- decode Yjs binary directly.
create table board_snapshots (
  board_id uuid references boards(id) on delete cascade primary key,
  yjs_state bytea not null,
  shape_graph jsonb not null,
  updated_at timestamptz default now()
);

-- Append-only raw update log. Useful for debugging sync issues and for
-- giving the AI agent recent-change context beyond just current state.
create table board_ops (
  id bigint generated always as identity primary key,
  board_id uuid references boards(id) on delete cascade,
  origin text not null, -- 'user:<user_id>' | 'ai'
  update_data bytea not null,
  created_at timestamptz default now()
);

alter table boards enable row level security;
alter table board_members enable row level security;
alter table board_snapshots enable row level security;
alter table board_ops enable row level security;

-- RLS: a user can read/write a board only if they're a member of it.
create policy "members can read boards" on boards
  for select using (
    exists (select 1 from board_members m where m.board_id = id and m.user_id = auth.uid())
  );

create policy "members can read snapshots" on board_snapshots
  for select using (
    exists (select 1 from board_members m where m.board_id = board_id and m.user_id = auth.uid())
  );

create policy "members can write snapshots" on board_snapshots
  for insert with check (
    exists (select 1 from board_members m where m.board_id = board_id and m.user_id = auth.uid())
  );

create policy "members can update snapshots" on board_snapshots
  for update using (
    exists (select 1 from board_members m where m.board_id = board_id and m.user_id = auth.uid())
  );

create policy "members can read ops" on board_ops
  for select using (
    exists (select 1 from board_members m where m.board_id = board_id and m.user_id = auth.uid())
  );

create policy "members can write ops" on board_ops
  for insert with check (
    exists (select 1 from board_members m where m.board_id = board_id and m.user_id = auth.uid())
  );

-- enable Realtime on the ops table isn't required — Broadcast is used for
-- live sync, not Postgres Changes. Realtime just needs to be turned on for
-- the project so Broadcast/Presence channels work.
