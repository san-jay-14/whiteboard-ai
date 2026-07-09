import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load /mcp-server/.env regardless of the process cwd — Claude Desktop
// launches the server with an arbitrary working directory, so resolve the
// path relative to this compiled file (dist/env.js -> ../.env).
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '..', '.env') });

export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Create mcp-server/.env (see .env.example).',
  );
}
