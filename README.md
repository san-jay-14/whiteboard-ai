# Collaborative Whiteboard with AI Co-Presence

See [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) for the full product spec, schema,
and build order — it is the source of truth for this project. See
[architecture.md](./architecture.md) for the system design rationale.

## Layout

- `frontend/` — Vite + React + TypeScript + Tailwind app
- `ai-agent/` — Node service for the AI co-presence agent (build-order step 9+)
- `mcp-server/` — Local MCP server exposing boards to Claude Desktop (step 8)
- `supabase/` — Schema migrations and project notes

## Status

Repository scaffolding only. Build-order steps 1–2 from `PROJECT_BRIEF.md`
section 7 are done: Supabase schema applied, frontend renders static
placeholder shapes. No sync, AI agent, or MCP server logic yet.
