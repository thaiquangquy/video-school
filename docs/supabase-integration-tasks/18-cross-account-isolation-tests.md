# Task 18 — Cross-account isolation test suite

Phase F — Verification & deployment. Depends on: 11. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) sections "9. Testing" and "Verification" item 4.

## Goal

This is the single most important correctness property cloud mode adds: two accounts must never see or affect each other's enrollment/progress/history, even though they share the same lesson catalog. Task 11 already covers individual-function behavior; this task specifically covers the *interaction* between two accounts, which no single-account test can catch.

## Files

- `tests/lessons.supabase.test.ts` (extend, from task 11) — or a new dedicated file, e.g. `tests/cross-account-isolation.supabase.test.ts`, if that reads more clearly given the setup complexity (two authenticated clients).

## Steps

1. This suite needs two distinct authenticated Supabase sessions simultaneously, not just one test client re-authenticating — set up two separate Supabase client instances, each signed in as a different test user (create both via the admin client's `auth.admin.createUser()` at test setup, or reuse fixtures if task 11 already established a pattern for creating test users).
2. Test cases:
   - **Enrollment isolation**: account A enrolls in lesson X. Query `getCatalog()`/`getEnrolledLessons()` as account B — confirm B sees `isEnrolled: false` for X in the catalog and X is absent from B's enrolled list.
   - **Progress isolation**: both A and B enroll in lesson X independently. A calls `upsertProgress` to 50%. Confirm B's progress for X is still `not_started`/0. B calls `upsertProgress` to 100% (completed). Confirm A's status is unaffected (still `in_progress` at 50%).
   - **Direct row-level isolation (defense-in-depth check)**: using A's session-bound client directly (not through `lib/lessons`), attempt to `select`/`update`/`delete` a `watch_progress`/`watch_events`/`enrollments` row belonging to B by id — confirm RLS blocks it (empty result set on select, zero rows affected on update/delete, not an error — that's Postgres RLS's normal "no matching rows" behavior, distinct from a thrown permission error).
   - **History isolation**: A and B both watch lesson X for different durations. Confirm `getHistory()`/`getHistorySummary()` for A only reflects A's `watch_events`, and vice versa for B.
3. Run this suite the same opt-in way as task 11's (`DATA_BACKEND=supabase npx vitest run ...`, against local `npx supabase start` with task 09's schema), truncating tables between tests.

## Acceptance test

All cases above pass. This task's own test cases *are* the acceptance criteria — there's no separate manual check needed beyond running the suite, though it's worth also manually spot-checking one isolation case in the browser (two accounts in two browser profiles/incognito windows) as a sanity check that RLS behaves the same through the actual app as it does in the test harness.
