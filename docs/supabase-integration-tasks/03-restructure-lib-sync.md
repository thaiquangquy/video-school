# Task 03 — Restructure `lib/sync.ts` into a dispatched module

Phase A — Foundation. Depends on: 01. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "5. `lib/sync/` and `lib/watcher.ts`".

## Goal

Same treatment as task 02, but for `lib/sync.ts` (`syncLessonsFromManifest`). This task only moves the existing SQLite logic — task 12 adds the Supabase implementation later.

## Files

- `lib/sync/sqlite.ts` (new — today's `lib/sync.ts` content, moved)
- `lib/sync/index.ts` (new — dispatcher, points at `sqlite.ts` for now)
- `lib/sync.ts` (deleted)

## Steps

1. Read today's `lib/sync.ts` in full first. Note it currently imports the module-level `db` singleton directly (no DI param, unlike `lib/lessons.ts`) — preserve that as-is for the SQLite path; don't introduce a DI param here unless a later task needs one.
2. Move the full `syncLessonsFromManifest` implementation into `lib/sync/sqlite.ts` verbatim, wrapped `async` (it may already be synchronous internally via `better-sqlite3` — just make the export return a `Promise`, same pattern as task 02).
3. Create `lib/sync/index.ts` that re-exports `syncLessonsFromManifest` from `./sqlite` (dispatcher logic by `BACKEND` gets added in task 12).
4. Delete the old `lib/sync.ts`.
5. Update `instrumentation.ts`'s import path if needed (path should resolve the same via `@/lib/sync` if that's the existing import style) — do not add the `initSchema()` guard yet, that's task 04.

## Acceptance test

`npm run dev` in sqlite mode (default): startup log output ("synced: N, archived: N") and resulting `data/app.db` state identical to the pre-refactor baseline for the same `data/lessons.yaml`. If there's existing test coverage for sync, it passes unchanged; if not, manually verify against a throwaway copy of `data/app.db`.
