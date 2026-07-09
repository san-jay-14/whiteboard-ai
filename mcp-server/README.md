# Whiteboard MCP server

Local, single-user, stdio MCP server that exposes the whiteboard boards to
Claude Desktop (build-order step 8, `PROJECT_BRIEF.md` section 6).

## Tools

- `list_boards()` → `[{ id, name, updated_at }]` for all boards.
- `get_board(board_id)` → the raw `board_snapshots.shape_graph` JSON (object keyed by shape id).
- `get_board_snapshot_image(board_id)` → a PNG of the board, rendered server-side from the
  same shape model the frontend draws (`src/render/svg.ts` mirrors the Konva layer), returned
  as an MCP image content block.

It reads Supabase directly with a **service-role key** (bypasses RLS — fine for a local
single-user server). No OAuth, no user auth.

## Setup

1. Install + build:

   ```bash
   cd mcp-server
   npm install
   npm run build
   ```

2. Create `mcp-server/.env` (already present as a template; it's gitignored). Set the
   service-role key — Supabase dashboard → **Project Settings → API → `service_role`**
   secret (project `whiteboard`, ref `bjyhhubhdtjjyyawppfs`):

   ```
   SUPABASE_URL=https://bjyhhubhdtjjyyawppfs.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<paste the service_role secret here>
   ```

## Register in Claude Desktop

Edit Claude Desktop's MCP config (**Settings → Developer → Edit Config**, which opens
`claude_desktop_config.json` — on Windows at
`%APPDATA%\Claude\claude_desktop_config.json`) and add:

```json
{
  "mcpServers": {
    "whiteboard": {
      "command": "node",
      "args": ["D:\\saas\\whiteboard\\mcp-server\\dist\\index.js"]
    }
  }
}
```

Notes:
- Use the absolute path to the built `dist/index.js` (above is this repo's location).
- No `env` block is needed — the server loads `mcp-server/.env` itself, resolved relative
  to `dist/index.js`, so it works regardless of the working directory Claude Desktop uses.
- Run `npm run build` again after any source change, then restart Claude Desktop.

Once registered, restart Claude Desktop and try: *"list my whiteboard boards"*, then
*"show me board &lt;id&gt; as an image"*.
