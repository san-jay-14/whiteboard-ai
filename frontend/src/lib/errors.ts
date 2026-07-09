// Supabase client calls (.from(...), .rpc(...)) resolve { error } as a
// PostgrestError-shaped plain object, not a thrown `Error` instance — code
// that does `if (error) throw error` (boards.ts) then hits a catch block
// where `e instanceof Error` is false. Falling through to String(e) on a
// plain object gives the useless "[object Object]", so every catch site
// needs to check for a `.message` string too.
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return String(e);
}
