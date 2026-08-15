// Session-bound Supabase client for cloud mode (DATA_BACKEND=supabase): every
// Server Component / Server Action / Route Handler that needs to read/write
// as the signed-in account uses this. It's subject to RLS via the anon key +
// the caller's session cookie — never use this for the sync/watcher startup
// paths, which have no user session (see lib/supabase/admin.ts for those).
//
// Cookie handling follows @supabase/ssr's current Next.js App Router
// contract (getAll/setAll, not the deprecated get/set/remove) — verified
// against node_modules/@supabase/ssr's own types before writing this, since
// this package moves fast and older getAll/setAll patterns exist online.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Read lazily (per-call), not at module load — this module must be safely
// importable in sqlite mode (e.g. by shared code paths) without throwing
// just because cloud-mode env vars aren't set.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}"`);
  }
  return value;
}

// Next.js 16's cookies() is async and, outside a Server Action/Route
// Handler, cookieStore.set() throws — swallow that in setAll rather than
// letting a Server Component render blow up. Session refresh still works
// end to end because proxy.ts (task 16) re-runs this same client on every
// request and can write cookies there.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render, where cookies() is
          // read-only. Safe to ignore as long as something with write
          // access (a Server Action, Route Handler, or proxy.ts) refreshes
          // the session on the next request that can.
        }
      },
    },
  });
}
