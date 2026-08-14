# Task 07 — Auth dispatcher + local login page

Phase B — Local auth. Depends on: 06. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "7. Auth".

## Goal

Wire task 06's cookie primitives into an actual login flow: a Server Action that sets the cookie on correct password, and a `getSession()` used by later tasks (proxy gate in task 08). Also stand up the `lib/auth/index.ts` dispatcher shape now, even though the Supabase branch doesn't exist until task 14 — stub it so the file compiles and throws clearly if `BACKEND === "supabase"` is hit before task 14 lands.

## Files

- `lib/auth/index.ts` (new)
- `app/login/page.tsx` (new)
- `app/login/actions.ts` (new, `"use server"`)

## Steps

1. `lib/auth/index.ts`:
   ```ts
   import { BACKEND } from "@/lib/backend";
   import * as local from "./local";

   export async function getSession() {
     if (BACKEND === "sqlite") return local.getSession();
     throw new Error("Supabase auth not yet implemented (see task 14)");
   }
   // signIn/signOut dispatched the same way, added to as each backend lands
   ```
   Add a `getSession()` function to `lib/auth/local.ts` (extending task 06) that reads the cookie via Next's `cookies()` (`next/headers`) and calls `verifySessionCookieValue`.
2. `app/login/actions.ts` — a `"use server"` action `signIn(formData: FormData)`:
   - Read the submitted password field.
   - Call `checkPassword` (task 06); on success, set the cookie (`cookies().set(COOKIE_NAME, createSessionCookieValue(), { httpOnly: true, secure: true, sameSite: "lax", path: "/" })`) and `redirect("/")`.
   - On failure, return an error state the form can display (use `useActionState`/`useFormState` per Next 16 conventions — check `node_modules/next/dist/docs` for the current App Router form-action pattern, since AGENTS.md warns conventions may differ from training data).
3. `app/login/page.tsx` — for now, a password-only form (local mode default). Task 15 later makes this branch to show email+password in cloud mode; don't build that branching yet, just get local mode working end to end.
4. Do not add the `proxy.ts` gate yet — that's task 08. This task should be reachable by navigating to `/login` directly.

## Acceptance test

Manual: `DATA_BACKEND=sqlite APP_PASSWORD=test123 SESSION_SECRET=<random> npm run dev`, navigate to `/login`, submit the correct password → redirected to `/` with a `session` cookie set (check dev tools). Submit the wrong password → error shown, no cookie set/updated.
