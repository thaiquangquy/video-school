# Task 02 — Restructure `lib/lessons.ts` into a dispatched module

Phase A — Foundation. Depends on: 01. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) sections "High-level architecture" and "4. Data layer".

## Goal

Turn today's single `lib/lessons.ts` (SQLite, synchronous, direct `better-sqlite3` calls) into a folder with a backend-agnostic async interface, so later tasks can plug in a Supabase implementation behind the same function names without touching any caller. This task only does the SQLite side + stubs — the real Supabase implementation is task 11.

## Files

- `lib/lessons/types.ts` (new)
- `lib/lessons/sqlite.ts` (new — today's `lib/lessons.ts` content, moved)
- `lib/lessons/index.ts` (new — dispatcher)
- `lib/lessons.ts` (deleted, replaced by the folder)
- `tests/lessons.test.ts` (update imports)

## Steps

1. Read the current `lib/lessons.ts` in full first — this task must not change any SQLite business logic (monotonic `upsertProgress`, non-monotonic `markStatus`, the 5-minute `watch_events` session-gap stitching, `getContinueLearning`'s `updated_seq` ordering, etc.). It's a pure refactor + async-wrap, not a rewrite.
2. Extract shared types (`LessonWithProgress`, `WatchStatus`, `WatchSource`, `ProgressInput`, `ContinueLearning`, `HistoryItem`, `HistorySummary`, etc.) into `lib/lessons/types.ts`.
3. Move the rest of today's `lib/lessons.ts` logic into `lib/lessons/sqlite.ts` verbatim, then wrap every exported function so it returns a `Promise` (e.g. `export async function getAllLessons(database = db) { return getAllLessonsSync(database); }` around the existing synchronous body, or simply mark the existing functions `async` — the internal `better-sqlite3` calls stay synchronous, only the export signature changes). Keep the existing trailing `database: Database.Database = db` DI parameter exactly as today (tests rely on it).
4. Add three new exports to `lib/lessons/sqlite.ts` for interface symmetry with the future Supabase path — all trivial no-ops/aliases, since local mode has no enrollment concept:
   ```ts
   export async function getEnrolledLessons(database: Database.Database = db) {
     return getAllLessons(database);
   }
   export async function getCatalog(database: Database.Database = db) {
     const lessons = await getAllLessons(database);
     return lessons.map((l) => ({ ...l, isEnrolled: true }));
   }
   export async function enroll(_lessonId: string, _database: Database.Database = db): Promise<void> {
     // no-op: every lesson is always visible/tracked under the one shared local login
   }
   export async function unenroll(_lessonId: string, _database: Database.Database = db): Promise<void> {
     // no-op, see enroll()
   }
   ```
   Adjust `getCatalog`'s return type so `isEnrolled: boolean` is part of the shared `LessonWithProgress`-adjacent type in `types.ts` (add it as an optional field there, since only the catalog view needs it).
5. Create `lib/lessons/index.ts` that re-exports everything from `sqlite.ts` for now (the dispatcher by `BACKEND` gets built out in task 11 once `supabase.ts` exists — don't reference `lib/backend.ts` yet if it makes this task depend on task 11; simplest is to import from `./sqlite` directly here and task 11 changes this file to branch by `BACKEND`).
6. Delete the old `lib/lessons.ts`.
7. Update every import of `@/lib/lessons` (or relative `lib/lessons`) across the codebase to keep working — since `lib/lessons/index.ts` re-exports the same names, imports of `@/lib/lessons` should need no path changes, only call sites need `await` added (that's task 05, not this task — don't add `await` at call sites yet, just make sure the module structure compiles).
8. Update `tests/lessons.test.ts`'s imports to the new path if needed (should already resolve via `@/lib/lessons` if that's how it imports today) and add `await` to every call into the now-async functions.

## Acceptance test

`npx vitest run tests/lessons.test.ts` passes with identical assertions to before this refactor (just `await` added) — no behavior change. `npx tsc --noEmit` clean.
