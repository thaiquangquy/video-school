// Service-role Supabase client for cloud mode (DATA_BACKEND=supabase).
//
// !!! BYPASSES ROW-LEVEL SECURITY ENTIRELY !!!
//
// This uses SUPABASE_SERVICE_ROLE_KEY, which ignores every RLS policy in
// supabase/migrations/0001_init.sql. It must only be imported by code that
// runs with no user session and needs to touch the shared `lessons` catalog
// table directly:
//   - lib/sync/supabase.ts (task 12) — reconciles data/lessons.yaml into
//     `lessons` on server start.
//   - lib/watcher.ts (task 13) — matches local video files to lessons.
// Never import this from anything reachable from a user request (a page, a
// Server Action, an API route) — use lib/supabase/server.ts's session-bound
// client there instead, so RLS stays the actual enforcement boundary for
// per-account data.
//
// No cookies/session involved — this is a plain createClient from
// @supabase/supabase-js, not @supabase/ssr.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Read lazily (per-call), not at module load — this module must be safely
// importable in sqlite mode without throwing just because cloud-mode env
// vars aren't set.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}"`);
  }
  return value;
}

export function createAdminClient() {
  return createSupabaseClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      // No browser/session context here — don't try to persist or
      // auto-refresh a session that doesn't exist.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
