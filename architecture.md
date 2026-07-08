# Collaborative Whiteboard with AI Co-Presence — Architecture & System Design

(working title — rename freely once the repo exists)

## 1. What we're building (one-line spec)

A real-time multiplayer whiteboard (rectangles, ellipses, connectors, text, freehand strokes, sticky notes) where an AI agent shares the canvas as a genuine peer — its own cursor, its own name tag — and periodically proposes edits (a missing connector, a duplicate-shape grouping, a gap annotation) as origin-tagged operations a human can accept or reject individually, plus a local MCP server so Claude Desktop can read and visually inspect any board directly.

## 2. Core mechanics

- Multiple humans draw on a shared canvas in real time, standard multiplayer-whiteboard behavior (live cursors, presence, drag/resize/rotate, multi-select).
- An AI agent is present in the same session with a distinct cursor style and "AI" badge. On a debounce trigger or a manual "ask AI to look" action, it reads the current shape graph and proposes a small number of additive actions via a constrained tool-use interface (not free-form canvas access).
- AI-authored shapes render with a dashed outline and pending-review badge until a human accepts (clears the flag) or rejects (deletes that shape only — doesn't touch anything else).
- A local MCP server exposes the board data to Claude Desktop: list boards, pull the structured shape graph, or pull a rendered image of the board so Claude can look at a sketch the way a human would.

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
  pendingReview?: boolean; // true only for unreviewed AI-authored shapes
};

type RectShape    = ShapeBase & { type: 'rect';    width: number; height: number; fill: string; stroke: string };
type EllipseShape = ShapeBase & { type: 'ellipse'; radiusX: number; radiusY: number; fill: string; stroke: string };
type ArrowShape    = ShapeBase & { type: 'arrow';   fromShapeId: string; toShapeId: string; points: number[] };
type TextShape     = ShapeBase & { type: 'text';    text: string; fontSize: number };
type StrokeShape   = ShapeBase & { type: 'stroke';  points: number[]; strokeWidth: number; color: string };
type StickyShape   = ShapeBase & { type: 'sticky';  text: string; color: string };

type Shape = RectShape | EllipseShape | ArrowShape | TextShape | StrokeShape | StickyShape;
```

Every shape carries `origin` + `authorId` — this is what makes per-shape accept/reject and future audit views possible without extra bookkeeping.

## 4. Tech stack

- **Frontend:** Vite + React + TypeScript + Tailwind, `react-konva` for canvas rendering
- **CRDT:** Yjs (`Y.Map<Shape>` per board) + `y-protocols/awareness` for cursors/presence
- **Sync transport:** Supabase Realtime Broadcast (chosen over a dedicated y-websocket server — see tradeoff below) + Supabase Presence for connection-level awareness
- **Persistence:** Supabase Postgres — full Yjs binary snapshot + denormalized JSON shape graph, debounce-written
- **AI agent:** Node service, joins the Realtime channel as its own peer, calls Claude API with tool-use
- **MCP server:** Node, `@modelcontextprotocol/sdk`, local stdio transport, reads directly from Supabase with a service-role key

## 5. Sync architecture — the Supabase Realtime tradeoff

Yjs is normally paired with `y-websocket`, which handles binary framing and update compaction for you. Using Supabase Realtime Broadcast instead means:

- Yjs updates must be base64-encoded (Broadcast is JSON-based) and **chunked** — keep individual broadcast payloads well under the channel's size ceiling, with a chunk-index/total header for reassembly on updates larger than a single message.
- No built-in update compaction — a debounced snapshot writer (full `Y.encodeStateAsUpdate(doc)` to Postgres every few seconds of inactivity) is required from day one, or the live ops history grows unbounded.
- On join, a client loads the latest Postgres snapshot via `Y.applyUpdate`, then subscribes to the channel for anything after that point.

This is the right call given your existing Supabase fluency and the fact you're not running a second always-on service just for sync — but it's the one place in this project where you're building infrastructure a purpose-built library would normally give you for free.

## 6. AI co-presence agent

- Trigger model (v1): debounce ~4–6s after the last human edit, OR an explicit "ask AI to look" button.
- On trigger, the agent serializes the current shape graph to plain JSON and calls Claude with a **constrained proposal toolset** — it does not get raw write access to the canvas:
  - `propose_connector(fromShapeId, toShapeId, reason)`
  - `propose_group(shapeIds, reason)`
  - `propose_annotation(nearShapeId, text)`
- A small executor turns each accepted tool call into a real Yjs insert, tagged `origin: 'ai'`, `pendingReview: true`.
- Accept clears `pendingReview`. Reject deletes just that shape. No origin-scoped undo manager needed for v1 — per-shape delete is simpler and just as safe.
- The agent's own Awareness entry uses a distinct cursor style/color and `kind: 'agent'` so it's visually unmistakable from a human collaborator.

## 7. Local MCP server

- Stdio transport, runs on your own machine, `@modelcontextprotocol/sdk`.
- Auth: a Supabase service-role key in your local env — fine for a single-user local server, no OAuth needed for v1.
- Tools:
  - `list_boards()` — your boards, id/name/last-updated
  - `get_board(board_id)` — the structured shape graph as JSON
  - `get_board_snapshot_image(board_id)` — server-side render of the shape graph to an image (reusing the same shape-drawing logic as the Konva layer, targeted at an offscreen renderer instead of the browser canvas), returned as an MCP image content block
- The image tool is the more compelling one for demos — Claude visually reading a sketch lands better than Claude reading coordinates.
- A hosted/remote version (OAuth 2.1, public deployment, same shape as your Figma/Canva/Supabase connectors) is a legitimate v2 — don't build it now.

## 8. Build order

See `PROJECT_BRIEF.md` for the full, numbered build order — that file is the one to hand to Claude Code.

## 9. Explicit non-goals for v1 (don't build these unless asked)

- Hosted/remote MCP connector with OAuth — local stdio only for now
- Origin-scoped Yjs `UndoManager` — per-shape delete covers the reject case
- Multi-agent (more than one AI participant per board)
- Mobile/touch input support
- Real permission tiers beyond owner/editor
