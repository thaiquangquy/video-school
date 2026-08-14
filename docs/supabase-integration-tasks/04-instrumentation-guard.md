# Task 04 — Guard `initSchema()` behind sqlite mode

Phase A — Foundation. Depends on: 01, 03. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "5. `lib/sync/` and `lib/watcher.ts`".

## Goal

`initSchema()` creates the SQLite tables at runtime — that only makes sense in local mode. In cloud mode, schema lives in `supabase/migrations/` (task 09) and must not be touched at app startup.

## Files

- `instrumentation.ts`

## Steps

1. Import `BACKEND` from `@/lib/backend` (task 01).
2. Wrap the existing `initSchema()` call in `if (BACKEND === "sqlite") { ... }`.
3. Leave `syncLessonsFromManifest()` and `startVideoWatcher()` calls unconditional (they already work against whichever backend is active via the dispatch layer built in later tasks) — just make sure they're `await`ed since their exports are now async (from tasks 02/03).

## Acceptance test

`DATA_BACKEND=sqlite npm run dev` starts cleanly with no regression (schema still created, sync still runs, watcher still starts). Confirm via a quick code read that `DATA_BACKEND=supabase npm run dev` would skip `initSchema()` — full cloud-mode startup verification happens later once tasks 09–12 exist, not here.
