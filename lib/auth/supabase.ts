// Supabase-mode auth primitives (DATA_BACKEND=supabase): real accounts via
// Supabase Auth (email + password), created manually in the dashboard — no
// self-service signup here. Session state lives in the httpOnly cookies
// written by @supabase/ssr's adapter (lib/supabase/server.ts), not a
// hand-rolled HMAC cookie like local mode. This module only builds the
// sign-in/sign-out/session-read primitives; the login page's cloud-mode
// branch (email + password form, task 15) and proxy.ts's session refresh
// (task 16/08) are responsible for calling into these and for redirecting.
import { createClient } from "@/lib/supabase/server";

// Mirrors local mode's app/login/actions.ts `SignInState` shape so a future
// cloud-mode login Server Action can use the same useActionState pattern
// regardless of which backend produced the result.
export type SignInResult = { error: string } | null;

// supabase.auth.signInWithPassword({email, password}) → on success,
// @supabase/ssr's cookie-writable server client (lib/supabase/server.ts)
// has already persisted the session cookies via its setAll adapter — no
// manual cookie handling needed here, unlike local mode's HMAC cookie.
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Don't leak whether the account exists — same generic message for bad
    // password vs. unknown email, mirroring local mode's undifferentiated
    // "Incorrect password." Log the real reason server-side for debugging.
    console.error("[ERROR] lib/auth/supabase.signIn: signInWithPassword failed", {
      message: error.message,
      status: error.status,
    });
    return { error: "Incorrect email or password." };
  }

  return null;
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();
  if (error) {
    // Not much a caller can do differently here — signOut clears local
    // session state client-side regardless — but log it so a failed
    // server-side revoke doesn't disappear silently.
    console.error("[ERROR] lib/auth/supabase.signOut: signOut failed", { message: error.message });
  }
}

// Returns a plain boolean — same shape as lib/auth/local.ts's getSession(),
// per the shape contract lib/auth/index.ts's dispatcher (and proxy.ts,
// transitively) depends on so callers never branch on which backend
// produced the result. getUser() (not getSession()) is used deliberately:
// it re-validates against the Supabase Auth server rather than trusting an
// unverified local JWT, per @supabase/ssr's Next.js guidance.
export async function getSession(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Expected/frequent when signed out — not logged as an error to avoid
    // spamming logs on every unauthenticated request.
    return false;
  }

  return Boolean(data.user);
}
