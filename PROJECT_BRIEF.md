# PROJECT BRIEF — Collaborative Whiteboard with AI Co-Presence

(working title — rename once the repo exists. This file is self-contained: read it fully before writing any code.)

## 1. Product summary

A real-time multiplayer whiteboard. Multiple humans draw shapes (rectangles, ellipses, connectors/arrows, text, freehand strokes, sticky notes) on a shared canvas with live cursors and presence. An AI agent shares the same session as a genuine peer — its own cursor, its own name tag, not a chat sidebar. On a debounce trigger or manual request, it proposes a small number of additive edits (a missing connector, a duplicate-shape grouping, a gap annotation) which render as dashed, pending-review shapes that any human can individually accept or reject. A local MCP server lets Claude Desktop list boards, pull a board's structured shape graph, or pull a rendered image of a board to visually interpret a sketch.

v1 scope: single AI agent per board, local-only MCP server, owner/editor permissions only, desktop/mouse input only.

## 2. Supabase schema

```sql
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
```

## 3. Shape data model

```typescript
type ShapeBase = {
  id: string;
  type: 'rect' | 'ellipse' | 'arrow' | 'text' | 'stroke' | 'sticky';
  x: number;
  y: number;
  origin: 'user' | 'ai';
  authorId: string;
  createdAt: number;
  pendingReview?: boolean;
};

type RectShape    = ShapeBase & { type: 'rect';    width: number; height: number; fill: string; stroke: string };
type EllipseShape = ShapeBase & { type: 'ellipse'; radiusX: number; radiusY: number; fill: string; stroke: string };
type ArrowShape    = ShapeBase & { type: 'arrow';   fromShapeId: string; toShapeId: string; points: number[] };
type TextShape     = ShapeBase & { type: 'text';    text: string; fontSize: number };
type StrokeShape   = ShapeBase & { type: 'stroke';  points: number[]; strokeWidth: number; color: string };
type StickyShape   = ShapeBase & { type: 'sticky';  text: string; color: string };

type Shape = RectShape | EllipseShape | ArrowShape | TextShape | StrokeShape | StickyShape;
```

Stored inside a Yjs document as `Y.Map<Shape>` keyed by `shape.id`.

## 4. Sync protocol (Yjs over Supabase Realtime Broadcast)

- One `Y.Doc` per open board. Shapes live in a top-level `Y.Map`.
- On `doc.on('update', (update, origin) => ...)`: base64-encode the update. If the encoded payload exceeds ~200KB, split into chunks with a `{ chunkIndex, totalChunks, updateId }` header; reassemble on the receiving end before `Y.applyUpdate`.
- Broadcast channel event name: `yjs-update`. Payload: `{ origin, chunkIndex, totalChunks, updateId, data }`.
- Awareness (cursors, names, colors) synced the same way over a second event, `yjs-awareness`, using `y-protocols/awareness` encode/decode helpers. Mirror connection-level presence into Supabase Presence so reconnects show accurate "who's here" state even before the first Yjs awareness update arrives.
- Debounced snapshot writer: after ~3s of inactivity (or every ~50 ops, whichever comes first), write `Y.encodeStateAsUpdate(doc)` plus a plain-JSON dump of the current shape map to `board_snapshots` (upsert).
- On join: fetch the latest `board_snapshots` row, `Y.applyUpdate(doc, snapshot.yjs_state)`, then subscribe to the channel for anything after that point.

## 5. AI co-presence agent

- Runs as a small Node service. Joins the same Supabase Realtime channel as a peer with client id `ai-agent`, sets its own Awareness state (`{ name: 'AI', color: <distinct>, kind: 'agent' }`) so it renders visually distinct in every client.
- Trigger conditions (v1): debounce ~4–6s after the last human edit event on a board it's watching, OR a manual "ask AI to look" broadcast event from any client.
- On trigger, serialize the current `Y.Map` shapes to plain JSON and call the Claude API with a **constrained tool-use schema** — the agent proposes, it never gets raw canvas-mutation access:

```typescript
tools: [
  {
    name: "propose_connector",
    description: "Suggest an arrow between two shapes that appear related but aren't yet connected",
    input_schema: {
      type: "object",
      properties: {
        fromShapeId: { type: "string" },
        toShapeId: { type: "string" },
        reason: { type: "string" }
      },
      required: ["fromShapeId", "toShapeId", "reason"]
    }
  },
  {
    name: "propose_group",
    description: "Suggest that a set of shapes be visually grouped (e.g. likely duplicates or a cluster)",
    input_schema: {
      type: "object",
      properties: {
        shapeIds: { type: "array", items: { type: "string" } },
        reason: { type: "string" }
      },
      required: ["shapeIds", "reason"]
    }
  },
  {
    name: "propose_annotation",
    description: "Suggest a short text annotation near a shape, e.g. flagging a missing case in a flow",
    input_schema: {
      type: "object",
      properties: {
        nearShapeId: { type: "string" },
        text: { type: "string" }
      },
      required: ["nearShapeId", "text"]
    }
  }
]
```

- An executor turns each returned tool call into a real Yjs insert with `origin: 'ai'`, `authorId: 'ai-agent'`, `pendingReview: true`.
- Frontend renders any shape with `pendingReview: true` with a dashed outline and a small "AI" badge.
- **Accept:** clear `pendingReview` on that shape (normal Yjs map update).
- **Reject:** delete that shape only. No other shape or session state is touched.

## 6. Local MCP server

- Node, `@modelcontextprotocol/sdk`, stdio transport, run locally via Claude Desktop's MCP config — no OAuth needed since it's single-user and local.
- Auth: a Supabase service-role key read from a local `.env`, never committed.
- Tools:

```typescript
// list_boards() -> [{ id, name, updated_at }]
// get_board(board_id: string) -> the shape_graph JSON from board_snapshots
// get_board_snapshot_image(board_id: string) -> renders shape_graph to an
//   image (reuse the shape-drawing logic from the Konva layer, targeted at
//   an offscreen SVG-to-PNG renderer) and returns it as an MCP image content
//   block, so Claude can visually inspect the sketch.
```

## 7. Build order (follow this sequence, one step at a time — pause for verification after each)

1. Supabase schema: run the DDL above, enable RLS policies, enable Realtime for the project
2. Frontend scaffold: Vite + React + TypeScript + Tailwind, `react-konva` rendering static hardcoded shapes, no sync yet
3. Local Yjs wiring: `Y.Map<Shape>` driving the Konva render, single-user, in-memory only, no network
4. Realtime transport: chunked/base64 Yjs update relay over a Supabase Broadcast channel — get two browser tabs syncing shape edits end to end
5. Awareness layer: live cursors, name tags, per-user colors via Yjs Awareness + Supabase Presence
6. Full shape toolset: connectors with anchor-snapping, freehand pen tool, sticky notes, multi-select, resize/rotate
7. Persistence: debounced snapshot writer to `board_snapshots`, board state reload from snapshot on join
8. Local MCP server: `list_boards`, `get_board`, `get_board_snapshot_image`, verify it works against a real board from Claude Desktop
9. AI agent service: joins the Realtime channel as a peer, gets its own distinct Awareness cursor, no reasoning yet — just presence
10. AI reasoning loop: debounce + manual trigger, Claude tool-use call over the serialized shape graph, executor applies accepted proposals as origin-tagged Yjs inserts
11. Accept/reject UX: dashed-outline styling for `pendingReview` shapes, accept/reject controls per shape
12. Polish: multi-board list view, invite-by-email sharing, reconnect/resync handling for dropped Realtime connections

## 8. Explicit non-goals for v1 (don't build these unless asked)

- Hosted/remote MCP connector with OAuth — local stdio only
- Origin-scoped Yjs `UndoManager` — per-shape delete covers reject
- More than one AI participant per board
- Mobile/touch input support
- Permission tiers beyond owner/editor
