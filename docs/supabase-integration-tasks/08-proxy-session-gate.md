# Task 08 — `proxy.ts` session gate

Phase B — Local auth. Depends on: 07. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "7. Auth".

## Goal

Actually gate the app behind the login flow built in tasks 06–07. **Important**: Next.js 16 renamed `middleware.ts` to `proxy.ts` — read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before writing this file, since the export name/shape and matcher conventions may differ from the `middleware.ts` pattern in your training data (per `AGENTS.md`'s warning at the repo root).

## Files

- `proxy.ts` (new, repo root — NOT `middleware.ts`)

## Steps

1. Confirm from the bundled docs: the exported function name (`proxy`, likely default or named export — verify), that it always runs on the Node.js runtime (no `runtime` config needed/allowed), and the `matcher` config shape.
2. Implement: call `getSession()` from `@/lib/auth` (task 07); if no valid session, redirect to `/login` (preserve the original path as a `?next=` param if that's easy, not required).
3. Matcher excludes: `/login` itself (avoid a redirect loop), Next's static asset paths (`_next/static`, `_next/image`), and `/api/health` (must stay reachable unauthenticated for uptime/Docker healthchecks — check task 19's Dockerfile work later doesn't assume auth on this route).
4. Since `getSession()` currently throws for `BACKEND === "supabase"` (per task 07's stub), this task is only fully testable in sqlite mode until task 16 lands — that's expected, don't try to build the Supabase session-refresh logic here.

## Acceptance test

Manual, `DATA_BACKEND=sqlite npm run dev`:
- Unauthenticated request to `/`, `/library`, `/watch/<id>`, `/history`, and any `/api/lessons*` route redirects to `/login`.
- After logging in (task 07's flow), the same routes load normally.
- `/api/health` is reachable with no cookie at all (`curl` it directly, confirm 200 with no redirect).
- `/login` itself never redirects (no loop).
