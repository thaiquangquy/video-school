# Task 15 — Login form branches by backend

Phase E — Cloud auth + enrollment UI. Depends on: 07, 14. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "7. Auth".

## Goal

Task 07 built a password-only login form for local mode. Cloud mode needs email+password (multiple accounts exist). Make one page render the right form shape based on the active backend, submitting to the correct dispatched Server Action either way.

## Files

- `app/login/page.tsx` (update)
- `app/login/actions.ts` (update: add a cloud-mode sign-in action, or generalize the existing one to accept email conditionally)

## Steps

1. Import `BACKEND` (and/or `SUPPORTS_ENROLLMENT`, whichever reads more clearly here — `BACKEND === "supabase"` is probably the more direct check for a form-shape decision) from `@/lib/backend`.
2. In `app/login/page.tsx`, conditionally render: local mode → the existing password-only form (task 07, unchanged); cloud mode → password field plus an email field.
3. In `app/login/actions.ts`, branch the Server Action: local mode calls the existing `checkPassword`/cookie flow (task 06/07, unchanged); cloud mode calls `lib/auth`'s dispatched `signIn(email, password)` (task 14) and lets `@supabase/ssr` handle cookie-setting, then redirects on success or returns an error on failure — same error-surfacing pattern as the local form for UI consistency.
4. Keep this a single page component with an internal branch, not two separate page files — the plan's intent is one login page, backend-aware, not a mode-duplicated UI surface.

## Acceptance test

Manual: `DATA_BACKEND=sqlite npm run dev` → `/login` shows password-only, unchanged from task 07's behavior. `DATA_BACKEND=supabase npm run dev` (pointed at a Supabase instance with task 09's schema and a test user from task 14) → `/login` shows email+password, successful submission signs in and redirects, wrong credentials show an error.
