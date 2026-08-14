# Task 10 — Supabase client helpers

Phase C — Supabase project. Depends on: 09. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) sections "2. Packages", "3. Environment variables", "High-level architecture".

## Goal

Two thin Supabase client factories that every later cloud-mode task builds on: a session-bound SSR client (subject to RLS, used for all normal per-account reads/writes) and a service-role admin client (bypasses RLS, used only by the startup sync/watcher which run with no user session).

## Files

- `package.json` (add `@supabase/supabase-js`, `@supabase/ssr`)
- `lib/supabase/server.ts` (new)
- `lib/supabase/admin.ts` (new)

## Steps

1. `npm install @supabase/supabase-js @supabase/ssr`.
2. `lib/supabase/server.ts` — `createServerClient` from `@supabase/ssr`, bound to Next's `cookies()` (`next/headers`), reading `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. This is the client every Server Component / route handler / Server Action in cloud mode uses — follow `@supabase/ssr`'s documented Next.js App Router cookie-adapter pattern exactly (getAll/setAll cookie methods), since getting this wrong silently breaks session persistence.
3. `lib/supabase/admin.ts` — a plain `createClient` (from `@supabase/supabase-js`, not `@supabase/ssr` — no cookies involved) using `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Add a clear comment that this bypasses RLS entirely and must only be imported by `lib/sync/supabase.ts` (task 12) and `lib/watcher.ts` (task 13) — never by anything reachable from a user request.
4. Both files should throw a clear error at call time (not import time, to avoid breaking sqlite-mode startup) if the required env vars are missing — these are only exercised when `BACKEND === "supabase"`.

## Acceptance test

A smoke test (can be a small standalone script or a vitest test gated to run only when Supabase env vars are present): using the admin client, `select * from lessons limit 1` against the instance from task 09 succeeds (empty result is fine, just confirm no connection/auth error). Confirm the server client, called with no session cookie present, gets a null user from `auth.getUser()` rather than throwing.
