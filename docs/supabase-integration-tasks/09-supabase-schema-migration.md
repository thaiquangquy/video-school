# Task 09 — Supabase Postgres schema migration

Phase C — Supabase project. Depends on: —. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "6. Supabase-mode schema" (has the full SQL this task should use verbatim).

## Goal

Define the complete cloud-mode schema: the shared `lessons` catalog table, three per-account tables (`enrollments`, `watch_progress`, `watch_events`), RLS policies enforcing per-account isolation, two views for reading, and four RPC functions for the writes that need atomicity or `auth.uid()`-scoping that a plain `supabase-js` call can't express.

## Files

- `supabase/migrations/0001_init.sql` (new)

## Steps

1. Copy the full SQL from the plan's "6. Supabase-mode schema" section verbatim into `supabase/migrations/0001_init.sql`, in this order (each depends on the previous existing):
   - `lessons`, `enrollments`, `watch_progress`, `watch_events` tables + the three indexes.
   - RLS enablement + the four policies (`lessons` is shared-read-if-authenticated; the other three are strictly `user_id = auth.uid()`).
   - The two views (`catalog_with_enrollment`, `my_enrolled_lessons_with_progress`), both with `security_invoker = true` — do not omit this, it's what makes RLS apply per-querying-account rather than per-view-owner.
   - The four functions (`enroll_in_lesson`, `unenroll_from_lesson`, `upsert_watch_progress`, `get_history_summary`), all `security invoker`.
2. Double-check the business-rule-critical parts transcribe exactly, since these mirror behavior that must match the SQLite path (tasks 02/11 test parity against this):
   - `upsert_watch_progress`'s monotonic status rule (never downgrade from `completed`) and its 5-minute (`interval '5 minutes'`) session-gap stitching into `watch_events`.
   - `unenroll_from_lesson` deletes only the `enrollments` row, explicitly leaving `watch_progress`/`watch_events` in place (comment this clearly in the SQL, it's easy to "helpfully" cascade-delete this by mistake).
3. Get access to a Supabase project for testing — either the user's real cloud project (ask if not already provided) or `npx supabase start` for a local instance during development; either way, apply the migration via `npx supabase db push` or by pasting the SQL into the target project's SQL editor.

## Acceptance test

Against whichever Supabase instance you're using: migration applies with zero errors. In Supabase Studio (local `npx supabase start` includes one, or the cloud project's dashboard), confirm: all 4 tables exist with the right columns/constraints; RLS is enabled on all 4 (green padlock in Studio's table list); both views exist and are queryable; all 4 functions exist. Do a manual sanity check as an authenticated test user (create one via Studio's Auth panel): `select * from catalog_with_enrollment` returns rows with `is_enrolled = false` for everything before any `enroll_in_lesson` call.
