# Task 17 — Browse-catalog + enroll/unenroll UI

Phase E — Cloud auth + enrollment UI. Depends on: 11, 16. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "8. Pages & API routes".

## Goal

The one real new user-facing feature in this whole integration: in cloud mode, an account browses the full lesson catalog and explicitly enrolls in lessons before they show up in "my lessons"/get progress-tracked. Local mode gets none of this UI — every lesson is already visible to everyone there, unchanged.

## Files

- `app/library/page.tsx` (update)
- `app/api/lessons/[id]/enroll/route.ts` (new, `POST`)
- `app/api/lessons/[id]/unenroll/route.ts` (new, `POST` or `DELETE`)

## Steps

1. `app/library/page.tsx` currently calls `getAllLessons()` (per the pre-refactor code) — after task 02/11, call `getEnrolledLessons()` instead for the main grid. This function already works correctly in both modes (local: all lessons; cloud: only enrolled ones) with zero page-level branching needed for that part.
2. Import `SUPPORTS_ENROLLMENT` from `@/lib/backend`. When true, additionally call `getCatalog()` and render a second section (e.g. "Browse all lessons" or similar — match the app's existing visual language, check `components/` for an existing card/grid component to reuse rather than building a new one) listing every catalog lesson with its `isEnrolled` flag: unenrolled lessons get an "Enroll" button, enrolled ones get an "Unenroll" button (or simply don't show a button and rely on the main grid above for those — your call on the cleanest UX, but don't let an already-enrolled lesson appear actionable as "enroll again").
3. When `SUPPORTS_ENROLLMENT` is false (local mode), this second section must not render at all — not just be visually hidden, actually absent from the page (don't fetch `getCatalog()` in local mode either, even though it's a harmless stub per task 02 — no reason to call it).
4. New routes:
   - `app/api/lessons/[id]/enroll/route.ts`: `POST` handler calling `lib/lessons`'s `enroll(id)`, following the same async-params pattern (`{ params }: { params: Promise<{ id: string }> }`) used throughout this codebase's existing dynamic routes.
   - `app/api/lessons/[id]/unenroll/route.ts`: same shape, calling `unenroll(id)`.
   Both are no-ops in local mode (task 02's stubs) — harmless if ever hit, but the Library page in local mode never calls them since the enroll UI doesn't render there.
5. Wire the buttons to `fetch(...)` these routes (client component, similar pattern to how `VideoPlayer.tsx` posts to `/api/lessons/[id]/progress`) and refresh/revalidate the page's lesson lists after a successful enroll/unenroll (Next.js `router.refresh()` or equivalent, matching whatever revalidation pattern other mutating actions in this app already use — check `ResetProgressButton` in `app/watch/[id]/page.tsx`'s vicinity for the existing convention).

## Acceptance test

Manual, cloud mode (Supabase instance from task 09, signed in as a test user from task 14):
- Library page shows an empty/near-empty "my lessons" grid initially (nothing enrolled yet) and a populated "Browse all lessons" section.
- Clicking Enroll on a lesson moves it into "my lessons" with `not_started` status, without a full page reload feeling broken (state updates promptly).
- Clicking Unenroll removes it from "my lessons"; re-enrolling shows it picks back up with whatever progress it had before (not reset — confirmed via task 11's `unenroll` behavior).
Manual, local mode: Library page shows only the single "all lessons" grid, no Browse/Enroll UI anywhere, identical to the pre-integration app.
