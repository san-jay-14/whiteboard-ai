# Supabase

Project: **whiteboard** (`bjyhhubhdtjjyyawppfs`), org `ahumdpgslokrzcrysjpj`, region `us-east-1`.

Schema applied via the Supabase MCP directly against the remote project (see
`migrations/0001_initial_schema.sql` for the exact DDL, matching
`PROJECT_BRIEF.md` section 2).

- Frontend connects with the URL + anon/publishable key in `/frontend/.env.local` (gitignored).
- The service-role key is **not** stored here. It belongs in `/mcp-server/.env` once
  build-order step 8 (local MCP server) starts — never in the frontend.

Note: creating this project required pausing the pre-existing "resurface" project
to stay within the org's free-tier active-project limit.
