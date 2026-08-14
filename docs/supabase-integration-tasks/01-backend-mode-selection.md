# Task 01 — Backend mode selection

Phase A — Foundation. Depends on: —. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md).

## Goal

Add the single env var that picks between local SQLite persistence and cloud Supabase persistence, read once at module load, failing loudly on a bad value. This underpins every other task — nothing else should read `process.env.DATA_BACKEND` directly.

## Files

- `lib/backend.ts` (new)
- `.env.example` (new)

## Steps

1. Create `lib/backend.ts`:
   ```ts
   const raw = process.env.DATA_BACKEND ?? "sqlite";
   if (raw !== "sqlite" && raw !== "supabase") {
     throw new Error(`Invalid DATA_BACKEND "${raw}" — must be "sqlite" or "supabase"`);
   }
   export const BACKEND = raw;
   export const SUPPORTS_ENROLLMENT = BACKEND === "supabase";
   ```
2. Create `.env.example` documenting all five env vars this integration introduces, grouped by mode, even though most aren't consumed until later tasks:
   ```
   # Mode selection — "sqlite" (default, local-only) or "supabase" (cloud, multi-account)
   DATA_BACKEND=sqlite

   # --- local mode (DATA_BACKEND=sqlite) ---
   APP_PASSWORD=
   SESSION_SECRET=

   # --- cloud mode (DATA_BACKEND=supabase) ---
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```
3. Do not wire `BACKEND`/`SUPPORTS_ENROLLMENT` into any other file yet — later tasks do that. This task is just the primitive.

## Acceptance test

Add a unit test (e.g. `tests/backend.test.ts`) that:
- Importing `lib/backend.ts` with `DATA_BACKEND` unset defaults to `"sqlite"`, `SUPPORTS_ENROLLMENT === false`.
- Importing with `DATA_BACKEND=supabase` resolves `BACKEND === "supabase"`, `SUPPORTS_ENROLLMENT === true`.
- Importing with `DATA_BACKEND=bogus` throws at import time.

(Vitest module-level env var tests typically need `vi.resetModules()` + dynamic `import()` per case, since the check runs once at module load — use that pattern.)
