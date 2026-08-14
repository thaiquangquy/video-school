# Task 11 — `lib/lessons/supabase.ts` implementation

Phase D — Supabase data layer. Depends on: 02, 10. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "4. Data layer" and "6. Supabase-mode schema" (for the exact view/function names and shapes this task queries).

## Goal

The real cloud-mode data layer: catalog browsing, per-account enrolled lessons, enroll/unenroll, progress tracking — implementing the same function names `lib/lessons/sqlite.ts` exports (task 02), so `lib/lessons/index.ts` can dispatch between them with zero caller changes. This is the largest single task in the plan — take it function by function against the schema from task 09.

## Files

- `lib/lessons/supabase.ts` (new)
- `lib/lessons/index.ts` (update: dispatch by `BACKEND` from `@/lib/backend` instead of always importing `./sqlite`)
- `tests/lessons.supabase.test.ts` (new, opt-in suite)

## Steps

1. Import the session-bound client from `@/lib/supabase/server` (task 10) — every function in this file uses it (never the admin client; that's reserved for sync/watcher).
2. `getCatalog()` → `.from('catalog_with_enrollment').select('*').order('order_index')` (or whatever ordering the sqlite path uses — match it for parity). Map `is_enrolled` (snake_case from Postgres) to `isEnrolled` (camelCase, matching the type added in task 02).
3. `getEnrolledLessons()` → `.from('my_enrolled_lessons_with_progress').select('*').order('order_index')`.
4. `getLessonById(id)` → same view, `.eq('id', id).maybeSingle()` — returns `null` if the id doesn't exist *or* the current account isn't enrolled in it (both cases look identical from the view's point of view, which is intentional — see the plan's note on `app/watch/[id]/page.tsx` treating "not enrolled" like "not found").
5. `enroll(lessonId)` → `.rpc('enroll_in_lesson', { p_lesson_id: lessonId })`.
6. `unenroll(lessonId)` → `.rpc('unenroll_from_lesson', { p_lesson_id: lessonId })`.
7. `upsertProgress(id, input)` → `.rpc('upsert_watch_progress', { p_lesson_id: id, p_position_seconds: input.positionSeconds, p_duration_seconds: input.durationSeconds, p_source: input.source, p_now: new Date().toISOString() })`, then re-fetch the lesson (`getLessonById`) to return the updated `LessonWithProgress`, matching the sqlite path's return shape.
8. `markStatus(id, status)` → plain `.from('watch_progress').upsert({ lesson_id: id, status, last_watched_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' })`. **Do not** make this monotonic — that's `upsertProgress`'s job only; this must stay able to move status in any direction, matching the sqlite path exactly (re-read `lib/lessons/sqlite.ts`'s `markStatus` docstring/comment for the exact non-monotonic contract before implementing).
9. `resetProgress(id)` → plain `.update()` resetting `position_seconds`/`duration_seconds`/`status`/`last_watched_at` to defaults, same fields the sqlite path resets — does not touch `watch_events`.
10. `getContinueLearning()` → `my_enrolled_lessons_with_progress` view, `.eq('status', 'in_progress').order('updated_seq', { ascending: false }).limit(1)` for the primary pick, plus the `upNext` query (excludes that lesson and anything `completed`, ordered by `order_index`/`subject`/`id` — match the sqlite path's exact ordering).
11. `getHistory(limit, offset)` → will need a `watch_history` view **not yet defined in the task 09 migration** — check the plan's section 4 bullet on `getHistory`; if the view is missing from `supabase/migrations/0001_init.sql`, add it there (a 3-way join of `watch_events`+`lessons`+`watch_progress`, `security_invoker = true`, scoped implicitly by RLS on `watch_events`/`watch_progress`) as part of this task, and note the addition in a follow-up migration file (e.g. `0002_watch_history_view.sql`) rather than editing `0001_init.sql` after task 09 may already be applied elsewhere. Use `.range(offset, offset + limit - 1)` and `{ count: 'exact' }` for pagination.
12. `getHistorySummary()` → `.rpc('get_history_summary')`, returns a single row — map it to the `HistorySummary` type from `lib/lessons/types.ts`.
13. Do **not** add explicit `.eq('user_id', ...)` filters anywhere above — RLS already scopes every query to `auth.uid()` server-side; adding a redundant filter isn't wrong but isn't necessary either, and the plan calls out relying on RLS as an intentional defense-in-depth property worth preserving (a query that "forgot" to filter still can't leak another account's rows).
14. Update `lib/lessons/index.ts` to actually dispatch now: `import { BACKEND } from "@/lib/backend"` and re-export from `./sqlite` or `./supabase` based on `BACKEND`.

## Acceptance test

New `tests/lessons.supabase.test.ts`, run opt-in against a local `npx supabase start` instance with task 09's migration applied (`DATA_BACKEND=supabase npx vitest run tests/lessons.supabase.test.ts`), truncating tables between tests (`truncate lessons, enrollments, watch_progress, watch_events restart identity cascade` — run as the admin client, since `truncate` needs elevated privileges). Cover at minimum:
- A lesson not yet enrolled doesn't appear in `getEnrolledLessons()`/`getLessonById()`, but does appear in `getCatalog()` with `isEnrolled: false`.
- `enroll()` makes it appear in both, with `status: 'not_started'`.
- `upsertProgress()` past 95% duration sets `status: 'completed'`; a subsequent lower-position heartbeat does not downgrade it (monotonic).
- `markStatus()` **can** move a `completed` lesson back to `in_progress` (non-monotonic, explicit override).
- Two heartbeats within 5 minutes of each other extend the same `watch_events` row (query `watch_events` directly and confirm row count stays 1, `ended_at` updates); a third heartbeat more than 5 minutes after the second creates a new row.
- `unenroll()` removes it from `getEnrolledLessons()` but `watch_progress`/`watch_events` rows still exist in the DB (query directly, not through the dispatch layer).
