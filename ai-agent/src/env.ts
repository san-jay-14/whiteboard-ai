import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load ai-agent/.env relative to this file so it works regardless of cwd.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '..', '.env') });

export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
// Which board the agent watches (single hardcoded board for v1, brief step
// 9). Precedence: CLI arg (`npm start -- <board-id>`) > env AGENT_BOARD_ID >
// default. Whichever board you open in the browser, run the agent with that
// board's id so both are on the same Realtime channel.
const cliBoardId = process.argv[2]?.trim();
export const AGENT_BOARD_ID =
  cliBoardId || process.env.AGENT_BOARD_ID || '14d40240-541a-483c-b841-aef960305eaf';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Create ai-agent/.env (see .env.example).');
}
if (!ANTHROPIC_API_KEY) {
  throw new Error('Missing ANTHROPIC_API_KEY. Create ai-agent/.env (see .env.example).');
}
