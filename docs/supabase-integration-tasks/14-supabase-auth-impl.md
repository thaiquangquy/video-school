# Task 14 — `lib/auth/supabase.ts` implementation

Phase E — Cloud auth + enrollment UI. Depends on: 07, 10. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "7. Auth".

## Goal

Real Supabase Auth session handling for cloud mode: sign in/out via email+password, session read via `getUser()`, wired into the `lib/auth/index.ts` dispatcher stubbed out in task 07. Supports any number of individual accounts — created manually in the Supabase dashboard, no self-service signup built here.

## Files

- `lib/auth/supabase.ts` (new)
- `lib/auth/index.ts` (update: replace the `throw` stub for `BACKEND === "supabase"` with real dispatch)

## Steps

1. Use the session-bound server client from `@/lib/supabase/server` (task 10) — it's already cookie-writable per `@supabase/ssr`'s Next.js adapter pattern.
2. `signIn(email, password)` → `supabase.auth.signInWithPassword({ email, password })`; on success the `@supabase/ssr` client has already written the session cookies via the adapter set up in task 10 — no manual cookie handling needed here, unlike the local-mode HMAC approach in task 06. On failure, return an error the calling Server Action can surface to the form.
3. `signOut()` → `supabase.auth.signOut()`.
4. `getSession()` → `supabase.auth.getUser()`; return `null`/falsy if no user, otherwise whatever shape `lib/auth/index.ts`'s dispatched `getSession()` is expected to return (check what task 07's local implementation returns and match its shape, even if the underlying data differs, so `proxy.ts` and any other caller don't need to branch on which backend produced it).
5. Update `lib/auth/index.ts`: replace the `throw new Error("Supabase auth not yet implemented...")` stub from task 07 with real dispatch to this file's functions when `BACKEND === "supabase"`.
6. No signup/registration UI or server action — accounts are created manually via the Supabase dashboard's Auth panel, per the plan's explicit scope decision.

## Acceptance test

Manual, against a local `npx supabase start` instance (task 09's schema applied) or the real cloud project: create two test users via Studio's Auth panel with known passwords. `DATA_BACKEND=supabase npm run dev` with env vars pointed at that instance:
- Sign in as user A with correct credentials → session established, `getSession()` returns a truthy result.
- Sign in with a wrong password → rejected, no session.
- Sign out → subsequent `getSession()` returns falsy.
- Sign in as user B → works independently of A's session (no cross-contamination), confirming multiple accounts are genuinely supported.
