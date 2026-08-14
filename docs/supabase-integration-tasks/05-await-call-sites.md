# Task 05 — Await every `lib/lessons`/`lib/sync` call site

Phase A — Foundation. Depends on: 02, 03. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "8. Pages & API routes".

## Goal

Every function in `lib/lessons`/`lib/sync` is now `async` (tasks 02–03). Every page/route that calls them needs `await` added. This is a pure mechanical pass — no new features, no behavior change, just making the app compile and run correctly against the new async signatures.

## Files

- `app/page.tsx`
- `app/library/page.tsx`
- `app/watch/[id]/page.tsx`
- `app/history/page.tsx`
- `app/api/lessons/route.ts`
- `app/api/lessons/[id]/route.ts`
- `app/api/lessons/[id]/mark-status/route.ts`
- `app/api/lessons/[id]/progress/route.ts`
- `app/api/lessons/[id]/reset/route.ts`
- `app/api/lessons/[id]/video/route.ts`
- `app/api/history/route.ts`
- `app/api/continue-learning/route.ts`

## Steps

1. For each file above, find every call into `getAllLessons`, `getLessonById`, `upsertProgress`, `markStatus`, `resetProgress`, `getContinueLearning`, `getHistory`, `getHistorySummary` (from `@/lib/lessons`) and add `await`. These are already inside `async` Server Components / route handlers (Next.js App Router convention, already used throughout this codebase for `params`/`searchParams`), so no function signatures need to become async that aren't already.
2. Double check `app/api/lessons/[id]/video/route.ts` specifically — its `getLessonById` lookup needs `await`, but the `fs`/Range-request streaming logic below it is untouched.
3. Run `npx tsc --noEmit` — TypeScript will flag any remaining un-awaited Promise usages (e.g. passed to something expecting a plain object) as a good cross-check, though a missing `await` on a top-level call won't always be a type error (an un-awaited Promise object is still assignable in loose contexts) — so don't rely on the compiler alone; visually diff each call site against the list above.

## Acceptance test

`npx tsc --noEmit` clean. `DATA_BACKEND=sqlite npm run dev`: manually exercise Home, Library, Watch, History pages and confirm identical behavior to the pre-refactor baseline — lesson lists render, progress heartbeats work, history/summary numbers are correct. This is a regression check, not a new-feature check.
