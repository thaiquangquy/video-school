# Task 13 — Dispatch `lib/watcher.ts`'s DB access

Phase D — Supabase data layer. Depends on: 11. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "5. `lib/sync/` and `lib/watcher.ts`".

## Goal

`lib/watcher.ts` currently makes direct `db.prepare(...)` calls (bypassing the DI/dispatch pattern used elsewhere) to read unmatched lessons and write `local_path`/`local_path_source` when chokidar detects a file add/remove. Replace those direct calls with small dispatched helpers so `watcher.ts` itself never imports `better-sqlite3` or the Supabase client directly — it only calls functions from `lib/lessons`.

## Files

- `lib/watcher.ts` (update)
- `lib/lessons/sqlite.ts`, `lib/lessons/supabase.ts`, `lib/lessons/index.ts` (add three new exports)

## Steps

1. Read `lib/watcher.ts` in full to find every direct `db.prepare(...)` call — expect roughly: a query for lessons with `local_path IS NULL` (unmatched candidates), an update setting `local_path`/`local_path_source = 'auto_matched'` on a match, and an update clearing `local_path` when a previously-matched file is deleted (`unlink` handler) or during the startup `pruneMissingLocalFiles()` sweep.
2. Add three matching functions to both `lib/lessons/sqlite.ts` and `lib/lessons/supabase.ts` (re-exported via `lib/lessons/index.ts`'s existing dispatch from task 11):
   - `getUnmatchedLessons()` → lessons where `local_path` is null and not archived. Sqlite: existing query logic moved here. Supabase: `.from('lessons').select('*').is('local_path', null).eq('archived', false)` via the **admin** client (this table has no per-account RLS concern since `lessons` is a shared catalog, but sync/watcher both use the admin client consistently since they run outside any session).
   - `setLocalPath(lessonId, path)` → sets `local_path`/`local_path_source = 'auto_matched'`. Sqlite: existing update moved here. Supabase: `.from('lessons').update({ local_path: path, local_path_source: 'auto_matched' }).eq('id', lessonId)` via admin client.
   - `clearLocalPath(lessonId)` → nulls both fields, same admin-client pattern for Supabase.
3. Update `lib/watcher.ts` to call these three functions instead of any `db.prepare(...)`. Chokidar setup, file-extension filtering, and the `videoMatch.ts` matching logic itself are untouched — only the read/write calls change.
4. Double-check `pruneMissingLocalFiles()` (the startup sweep) is updated the same way if it also does direct `db.prepare(...)` calls.

## Acceptance test

Sqlite mode: existing auto-match behavior is unchanged — drop a file into `data/videos/` matching an unmatched lesson's id/title, confirm `local_path` gets set exactly as before this refactor; delete it, confirm it clears. Supabase mode (against local `npx supabase start` with task 09's schema): same manual test, but confirm the `lessons` table (via Studio or a direct admin-client query) reflects the change — this is the shared catalog table, so it should be visible regardless of which account is later browsing it.
