# Task 16 — `proxy.ts` verified against Supabase session refresh

Phase E — Cloud auth + enrollment UI. Depends on: 08, 14. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "7. Auth".

## Goal

Task 08 built the `proxy.ts` gate against local mode's `getSession()`, with the Supabase branch throwing (task 07's stub). Task 14 replaced that stub with real Supabase Auth. This task verifies (and if needed, adjusts) `proxy.ts` for cloud mode specifically — Supabase sessions expire and need periodic refresh, which `@supabase/ssr` handles via a specific proxy/middleware pattern that must run on every request to keep cookies current.

## Files

- `proxy.ts` (update if the existing task-08 implementation doesn't already handle Supabase's refresh pattern)

## Steps

1. Re-read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` alongside `@supabase/ssr`'s documented Next.js proxy/middleware pattern (its README or the Supabase Auth guide for Next.js) — the standard pattern is: create a Supabase server client inside `proxy.ts` itself (not reusing `lib/supabase/server.ts`'s Server Component version, since proxy needs its own request/response cookie plumbing), call `supabase.auth.getUser()` to force a refresh, and propagate any updated cookies onto the outgoing response before returning it.
2. If task 08's `proxy.ts` already calls `getSession()` generically and that's sufficient for cloud mode too (i.e. `lib/auth/supabase.ts`'s `getSession()` from task 14 already does the refresh-and-cookie-propagation correctly when called from a Server Component context), confirm that specifically — Supabase's docs are explicit that proxy/middleware-context session handling has a different cookie API than Server Component context, so don't assume task 14's `getSession()` is directly reusable here without checking.
3. Keep the matcher exclusions from task 08 (`/login`, static assets, `/api/health`) unchanged.

## Acceptance test

Manual, cloud mode against a local or real Supabase instance:
- Unauthenticated request to any gated route redirects to `/login`, same as local mode.
- Authenticated request passes through.
- Simulate a near-expiry session (Supabase access tokens are short-lived; either wait it out or reduce the token expiry in the test project's Auth settings) and confirm a request through `proxy.ts` transparently refreshes it rather than incorrectly redirecting to `/login` mid-session.
