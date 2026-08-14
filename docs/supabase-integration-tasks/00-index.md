# Supabase integration — task index

Full context/architecture: [`../supabase-integration-plan.md`](../supabase-integration-plan.md). Read it before starting any task below — each task file is self-contained for *what to do*, but the plan explains *why*.

Tasks are ordered; `Depends-on` marks hard sequencing — don't start a task until everything it depends on is merged/verified. Tasks with no dependency relationship to each other can run in parallel (e.g. different subagents at once).

| # | Task | Phase | Depends-on |
|---|------|-------|------------|
| [01](01-backend-mode-selection.md) | Add `lib/backend.ts` mode selection + `.env.example` | A — Foundation | — |
| [02](02-restructure-lib-lessons.md) | Restructure `lib/lessons.ts` into `lib/lessons/{types,sqlite,index}.ts`, async-wrapped | A — Foundation | 01 |
| [03](03-restructure-lib-sync.md) | Restructure `lib/sync.ts` into `lib/sync/{sqlite,index}.ts` | A — Foundation | 01 |
| [04](04-instrumentation-guard.md) | Guard `initSchema()` in `instrumentation.ts` behind sqlite mode | A — Foundation | 01, 03 |
| [05](05-await-call-sites.md) | Add `await` to every `lib/lessons`/`lib/sync` call site in `app/**` | A — Foundation | 02, 03 |
| [06](06-local-auth-cookie.md) | `lib/auth/local.ts`: HMAC-signed cookie sign/verify | B — Local auth | 01 |
| [07](07-local-login-ui.md) | `lib/auth/index.ts` dispatcher + `app/login/page.tsx` (password-only) + sign-in action | B — Local auth | 06 |
| [08](08-proxy-session-gate.md) | `proxy.ts` session gate | B — Local auth | 07 |
| [09](09-supabase-schema-migration.md) | `supabase/migrations/0001_init.sql`: tables, RLS, views, functions | C — Supabase project | — |
| [10](10-supabase-client-helpers.md) | Add Supabase packages + `lib/supabase/server.ts` + `lib/supabase/admin.ts` | C — Supabase project | 09 |
| [11](11-supabase-lessons-impl.md) | `lib/lessons/supabase.ts`: full implementation | D — Supabase data layer | 02, 10 |
| [12](12-supabase-sync-impl.md) | `lib/sync/supabase.ts`: manifest reconciliation | D — Supabase data layer | 03, 10 |
| [13](13-watcher-dispatch.md) | `lib/watcher.ts`: dispatched local-path helpers | D — Supabase data layer | 11 |
| [14](14-supabase-auth-impl.md) | `lib/auth/supabase.ts`: signIn/signOut/getSession | E — Cloud auth + enrollment UI | 07, 10 |
| [15](15-login-form-branch.md) | `app/login/page.tsx` branches by backend (email+password in cloud mode) | E — Cloud auth + enrollment UI | 07, 14 |
| [16](16-proxy-supabase-session.md) | `proxy.ts` dispatch verified against Supabase session refresh | E — Cloud auth + enrollment UI | 08, 14 |
| [17](17-enrollment-ui.md) | `app/library/page.tsx` Browse-Catalog + Enroll/Unenroll UI + API routes | E — Cloud auth + enrollment UI | 11, 16 |
| [18](18-cross-account-isolation-tests.md) | Cross-account isolation test suite | F — Verification & deployment | 11 |
| [19](19-dockerfile-updates.md) | `Dockerfile` updates for both modes | F — Verification & deployment | 08, 17 |
| [20](20-update-claude-md.md) | Update `CLAUDE.md` to document both modes | F — Verification & deployment | 19 |
