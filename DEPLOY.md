# Deploying the whiteboard

Three things get deployed (the local **MCP server is intentionally skipped** —
see the end):

| Component    | Host                         | Type                    |
| ------------ | ---------------------------- | ----------------------- |
| `frontend/`  | **Vercel**                   | Static SPA              |
| `supabase/`  | **Supabase Cloud**           | Postgres + Realtime + Auth |
| `ai-agent/`  | **Railway** (optional)       | Always-on Node worker   |

The frontend talks **directly** to Supabase (REST, Realtime, Auth) — there is
no custom API server for the app itself.

---

## 1. Supabase (backend)

1. Create a project at <https://supabase.com> (a dedicated **prod** project is
   recommended over reusing dev). Pick a region near your users.
2. Apply the migrations in `supabase/migrations/` **in order**. Either:
   - CLI: `supabase link --project-ref <ref>` then `supabase db push`, or
   - Dashboard → SQL Editor → paste each `0001…`→`0004…` file and run.
3. **Auth → Providers → enable "Anonymous sign-ins".** The app cannot start a
   session without this.
4. Copy two keys from **Project Settings → API**:
   - **Project URL** and **anon/public key** → for the frontend.
   - **service_role secret** → for the agent only (never the frontend).

## 2. Frontend (Vercel)

1. <https://vercel.com> → **Add New → Project** → import this GitHub repo.
2. Set **Root Directory = `frontend`** (Framework preset auto-detects Vite:
   build `npm run build`, output `dist`).
3. **Environment Variables** (see `frontend/.env.example`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy.** No SPA rewrite rules needed (the app has no URL router). Add a
   custom domain if you have one.

> These vars are baked in at **build time** — after changing them, redeploy.

## 3. AI agent (Railway) — optional

The agent is a persistent worker (holds a Realtime websocket + debounce
timers), so it can't run on serverless functions. It currently watches **one**
board (`AGENT_BOARD_ID`) — treat it as a single-board / demo feature until
multi-board watching is built.

1. <https://railway.app> → **New Project → Deploy from GitHub repo** → this repo.
2. In the service **Settings → Root Directory = `ai-agent`**. The agent is
   self-contained (its `shared/` deps are vendored under `ai-agent/src/shared`),
   so Railway's default Node builder (Nixpacks) just runs `npm ci` + `npm start`
   — no Dockerfile or repo-root context needed.
3. **Variables:**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`  *(secret)*
   - `ANTHROPIC_API_KEY`          *(secret)*
   - `AGENT_BOARD_ID`  — a real board id from your prod DB (create a board in
     the deployed app first, then copy its id)
4. Deploy. Logs should show `channel status: SUBSCRIBED` and
   `AI agent present and watching.`

## Environment variable reference

| Variable                    | Where          | Secret? | Source                                   |
| --------------------------- | -------------- | ------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`         | Vercel         | no      | Supabase → API → Project URL             |
| `VITE_SUPABASE_ANON_KEY`    | Vercel         | no      | Supabase → API → anon public             |
| `SUPABASE_URL`              | Railway        | no      | same Project URL                         |
| `SUPABASE_SERVICE_ROLE_KEY` | Railway        | **yes** | Supabase → API → service_role secret     |
| `ANTHROPIC_API_KEY`         | Railway        | **yes** | console.anthropic.com → API Keys         |
| `AGENT_BOARD_ID`            | Railway        | no      | a board id in your prod DB               |

## Post-deploy smoke test

1. Open the Vercel URL → you should reach the board list (anonymous session).
2. Create a board, draw shapes, reload → shapes persist.
3. Open the same board in a second browser → shapes + cursors sync live.
4. (If the agent is deployed) open the `AGENT_BOARD_ID` board → the agent shows
   in the presence list; "Ask AI" produces pending-review suggestions.

## Before a public launch

- **Review RLS.** Anonymous auth + open board creation means row-level
  security is the only guard. Audit that users can only read/write boards they
  belong to (run `/security-review` on the branch).
- **Cost/abuse.** Supabase free tier caps Realtime connections/messages; the
  service-role key and Anthropic key both bill/expose if leaked — keep them in
  Railway only.

## MCP server (deferred)

`mcp-server/` stays a **local stdio** tool for Claude Desktop and is not part
of this deployment. Making it a public remote connector requires OAuth 2.1 +
per-user data scoping (dropping the global service_role client) — a separate,
optional fast-follow.
