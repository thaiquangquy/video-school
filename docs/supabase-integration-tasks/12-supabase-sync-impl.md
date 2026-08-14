# Task 12 — `lib/sync/supabase.ts` implementation

Phase D — Supabase data layer. Depends on: 03, 10. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "5. `lib/sync/` and `lib/watcher.ts`".

## Goal

Reconcile `data/lessons.yaml` into the shared `lessons` table in cloud mode, using the admin (service-role) client since sync runs at server startup with no user session. Must replicate the sqlite path's exact merge semantics: upsert manifest content, preserve an `auto_matched` `local_path` the manifest doesn't override, and soft-archive lessons removed from the manifest — while explicitly **not** touching any per-account table (`enrollments`/`watch_progress`/`watch_events`), since those are created lazily via `enroll()` (task 11), not seeded by sync.

## Files

- `lib/sync/supabase.ts` (new)
- `lib/sync/index.ts` (update: dispatch by `BACKEND`)

## Steps

1. Read `lib/sync/sqlite.ts`'s `syncLessonsFromManifest` (task 03) closely first — this task must produce equivalent end-state semantics against Postgres, not necessarily the same SQL shape.
2. Import the admin client from `@/lib/supabase/admin` (task 10) — never the session-bound client here, sync has no user session.
3. Read the manifest the same way the sqlite path does (reuse whatever manifest-reading helper it already uses — check if it's factored out separately or inline; if inline, consider factoring it into a shared `lib/manifest.ts` used by both, since the parsing logic itself has nothing backend-specific about it — but don't over-scope this task if it's a small inline function, duplicating a few lines is acceptable too).
4. Fetch all existing `lessons` rows once (`.from('lessons').select('*')`).
5. Diff in memory against the manifest:
   - For each manifest entry: build the upsert row. If the manifest doesn't specify `localPath` and the existing row (if any) has `local_path_source = 'auto_matched'`, carry the existing `local_path`/`local_path_source` forward instead of nulling it out.
   - Batch `.from('lessons').upsert(rows, { onConflict: 'id' })`.
   - For any existing row whose `id` is no longer in the manifest: batch `.from('lessons').update({ archived: true }).in('id', removedIds)`.
6. Return the same `{ synced, archived }` shape the sqlite path returns, for parity in whatever logs `instrumentation.ts` prints.
7. Update `lib/sync/index.ts` to dispatch by `BACKEND` (mirrors task 11's update to `lib/lessons/index.ts`).

## Acceptance test

Add a test (e.g. `tests/sync.supabase.test.ts`, opt-in against local Supabase, same truncate-between-tests pattern as task 11):
- Run sync with a 3-lesson manifest → all 3 rows created, `archived: false`.
- Manually set one row's `local_path`/`local_path_source: 'auto_matched'` directly via the admin client, then re-run sync with the same manifest (no `localPath` for that lesson) → confirm the `auto_matched` path survives.
- Re-run sync with one lesson removed from the manifest → that row's `archived` becomes `true`, the other two remain `archived: false`, and no row is ever deleted (row count unchanged).
- Confirm no rows are written to `enrollments`/`watch_progress`/`watch_events` by sync at any point in this test.
