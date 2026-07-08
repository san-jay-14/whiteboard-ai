import { supabase } from './supabaseClient';

// v1 has no real login. We use Supabase anonymous auth purely to get a
// genuine auth.users row + auth.uid() so the section-2 RLS policies and FKs
// (boards.owner_id, board_members.user_id) are satisfiable. supabase-js
// persists the session in localStorage, so reopening a tab restores the
// same anonymous user — which is what lets a reopened tab still see (and
// reload) the boards it created.
let sessionPromise: Promise<string> | null = null;

async function resolveSession(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) {
    return existing.session.user.id;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error('anonymous sign-in returned no user');
  return data.user.id;
}

// Deduped so concurrent/repeated callers (e.g. React StrictMode's
// double-invoked effects) never trigger a second anonymous sign-in.
export function ensureAnonSession(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = resolveSession().catch((err) => {
      sessionPromise = null; // allow a retry after a failure
      throw err;
    });
  }
  return sessionPromise;
}
