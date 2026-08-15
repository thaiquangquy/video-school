# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — dev server, binds `0.0.0.0:3000` (LAN-reachable, e.g. for testing on an iPad)
- `npm run build` / `npm run start` — production build and run (same binding as dev)
- `npm run lint` — ESLint (`eslint-config-next` core-web-vitals + typescript)
- `npm run test` — Vitest, runs the full suite once
- `npx vitest run tests/lessons.test.ts` — single test file
- `npx vitest run -t "test name substring"` — single test by name
- `npm run test:coverage` — Vitest with the coverage gate (see "Testing" below)
- `npm run test:e2e` — Playwright e2e suite (`e2e/**`), headless Chromium against port 3100
- `npm run test:e2e:ui` — same, in Playwright's interactive UI mode (useful while writing/debugging a spec)
- `npx tsc --noEmit` — typecheck
- Docker: one image, two modes via `DATA_BACKEND` (`sqlite` default or `supabase`) — but `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` must also be passed as `--build-arg` at build time (they're inlined into the JS bundle by `next build`), unlike the other mode-selection vars which are pure `docker run -e` runtime vars. Exact `docker build`/`docker run` invocations for both modes: README's "Running with Docker" section (kept there, not duplicated here, to avoid drift). The bind-mounted `data/` volume persists `data/lessons.yaml` edits, `data/videos/`, and (local mode only) the sqlite db across rebuilds; without it the container falls back to the `data/` baked into the image.

## Using `cv` (CV-Git)

This repo has `cv` (`@controlvector/cv-git`) initialized — `.cv/` holds a knowledge graph of this codebase (symbols, relationships, commit history), synced via `cv sync`. Prefer `cv` over built-in tools for the cases below; fall back to the normal tool if `cv` errors, isn't available, or the graph is stale — it's additive, not a hard dependency.

**Search / understanding** — prefer over Grep/Explore for natural-language or relationship-aware lookups:
- `cv find "<query>" [--language <lang>] [--file <path>] [--limit N]` — semantic code search
- `cv explain <target> [--deep]` — explain a symbol/file/concept using the graph
- `cv context "<query>" [--format markdown|xml|json] [--depth N]` — pull graph-aware context (files + relationships) before starting a task

**Git operations** — prefer over raw `git`; the `cv` wrappers auto-sync `.cv/`'s graph on every op, which raw `git` doesn't:
- `cv add`, `cv commit -m "..."`, `cv diff`, `cv log`, `cv push`, `cv pull`, `cv branch`, `cv checkout`, `cv switch`, `cv stash`, `cv merge`, `cv fetch`, `cv remote`, `cv reset`, `cv revert`, `cv tag`
- Flags are drop-in equivalents to their `git` counterparts (e.g. `cv commit -m "msg"`, `cv diff --staged`) — the git conventions elsewhere in this file (new commits over amends, no `--no-verify`, etc.) still apply.

**Out of scope** — don't use unless explicitly asked by name: `cv do`, `cv code`, `cv chat`, `cv review`. These call `cv`'s own configured AI provider, which is redundant when Claude Code is already the agent doing the work.

## Architecture

Next.js App Router app for tracking homeschool video-lesson watch progress, deployable in two modes selected by `DATA_BACKEND` (see "Backend selection" below): **local/sqlite mode** (default) — no auth beyond a single shared household password, not internet-facing, LAN only — and **cloud/supabase mode** — real multi-account auth via Supabase, remotely accessible. This section covers behavior common to both modes plus the sqlite-specific internals; for the full dual-backend design rationale (why cloud mode exists, schema, RLS, migration history) see `docs/supabase-integration-plan.md`.

Local mode's SQLite (`better-sqlite3`); cloud mode's Supabase Postgres — either way, `data/lessons.yaml` is the source of truth for lesson *content* in both modes. This and the watch-state store are kept in sync, not merged: `lib/sync/` (`syncLessonsFromManifest`, dispatched to `lib/sync/sqlite.ts` or `lib/sync/supabase.ts` by backend) reconciles the manifest into the shared `lessons` table on every server start (called from `instrumentation.ts`). Lessons removed from the manifest are archived, not deleted, so their `watch_progress`/`watch_events` history survives a re-add.

`data/config.yaml` (`lib/config.ts`) is separate, optional, app-level config, mode-agnostic: `driveFolderUrl` (a convenience link shown in the UI, not a data source — there's no Drive API key wired in, so unlike local files there's no live listing/auto-matching against a Drive folder) and `videosDir` (overrides the local video base directory, default `data/videos/` — e.g. pointing it at a Google Drive Desktop sync target to stream those files directly).

### Backend selection (`lib/backend.ts`)

`DATA_BACKEND` (`sqlite` default, or `supabase`) is read once at module load in `lib/backend.ts`, which validates it and exports `BACKEND` and `SUPPORTS_ENROLLMENT` (`true` only for `supabase`) — nothing else reads `process.env.DATA_BACKEND` directly. All 6 env vars across both modes (`DATA_BACKEND`, local mode's `APP_PASSWORD`/`SESSION_SECRET`, cloud mode's `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) are documented in `.env.example`, along with three e2e-only isolation overrides (`DB_PATH`/`LESSONS_MANIFEST_PATH`/`APP_CONFIG_PATH` — see "Testing" below).

Both modes are dispatched through a common interface rather than duplicated call sites — callers only ever import each barrel's `index.ts`, never branch on `BACKEND` themselves (except `SUPPORTS_ENROLLMENT`-gated UI, below):
- `lib/lessons/{sqlite,supabase}.ts` behind `lib/lessons/index.ts` (imported as `@/lib/lessons`) — lesson CRUD, progress, history, catalog/enrollment. `lib/lessons/types.ts` holds the shared types.
- `lib/sync/{sqlite,supabase}.ts` behind `lib/sync/index.ts` (`@/lib/sync`) — manifest reconciliation.
- `lib/auth/{local,supabase}.ts` behind `lib/auth/index.ts` (`@/lib/auth`) — session read, used by `proxy.ts` and `app/login`.

**Cloud mode isn't just a backend swap** — it adds per-account enrollment, the one real behavioral divergence between modes. In local mode there's one shared household login and every manifest lesson is implicitly "enrolled" (`lib/lessons/sqlite.ts`'s `enroll`/`unenroll` are no-ops; `getCatalog` returns every lesson already marked enrolled). In cloud mode, each account (a real Supabase Auth user, created manually in the dashboard — no self-service signup) has independent `enrollments`/`watch_progress`/`watch_events`, and a lesson only starts tracking progress for an account once that account enrolls, via the Library page's catalog UI (`components/CatalogLessonCard.tsx` calling `app/api/lessons/[id]/{enroll,unenroll}/route.ts`). Un-enrolling stops a lesson appearing in "my lessons" but preserves that account's history, same archive-don't-delete philosophy as manifest removal above. Pages/components gate this UI behind `SUPPORTS_ENROLLMENT` rather than duplicating pages per mode. Schema/RLS/views behind it: `supabase/migrations/0001_init.sql`.

### Auth

- Local mode: single household password (`APP_PASSWORD`), a signed session cookie handled by `lib/auth/local.ts` + `app/login/actions.ts` (Server Action).
- Cloud mode: per-account email+password login against Supabase Auth (`lib/auth/supabase.ts`) — this is what makes cloud mode safe to expose beyond the LAN, since accounts (not network locality) do the isolating.
- Both modes: `proxy.ts` (Next.js 16's replacement for `middleware.ts`) is the session gate, redirecting unauthenticated requests to `/login`. Local mode reuses `lib/auth`'s dispatched `getSession()` as-is; cloud mode builds its own request/response-bound Supabase client per `@supabase/ssr`'s documented middleware pattern instead of going through the dispatcher, since Proxy is a read-only cookie context and refreshing a Supabase session requires writing cookies back onto the response. `/login` and `/api/health` are excluded from the gate (see `proxy.ts`'s `matcher`).

### Video source resolution

Each lesson resolves to a local file, a Drive URL, or nothing, in that priority order:

- `lib/watcher.ts` resolves `VIDEOS_DIR` once at module load from `data/config.yaml`'s `videosDir` (falling back to `data/videos/`), then starts a chokidar watch on it once per process (`startVideoWatcher()`, called from `instrumentation.ts`, idempotent). New files are matched to lessons that don't yet have a `local_path`, via `lib/videoMatch.ts`: normalize the filename and compare against normalized lesson `id`/`title`, trying exact-id → exact-title → segment-bounded-substring-id → segment-bounded-substring-title, first tier with any hits wins; multiple hits within a tier is reported ambiguous and left unmatched rather than guessed.
- `local_path_source` (`'manifest'` vs `'auto_matched'`) distinguishes an explicit `localPath` from a watcher-filled one — both `lib/sync/sqlite.ts` and `lib/sync/supabase.ts` check this so a manifest re-sync doesn't null out an auto-matched path.
- If a linked file is later moved/deleted, `local_path` is cleared (watcher `unlink` handler + a `pruneMissingLocalFiles()` startup sweep) and the lesson falls back to `driveUrl` if set.
- `app/api/lessons/[id]/video/route.ts` streams local files with HTTP Range support (`lib/rangeRequest.ts` parses the `Range` header and produces 200/206/416 responses). With no `localPath`, it instead returns `{ source: "drive", driveUrl }` JSON. `components/VideoPlayer.tsx` branches on that: a real `<video>` for local playback (with resume + heartbeat progress posting), or a Drive `/preview` iframe with manual status buttons — Drive playback position can't be observed programmatically, so progress there is user-driven via `mark-status`.

### Progress/status model (`lib/lessons/{sqlite,supabase}.ts`)

Same rules in both modes — `lib/lessons/supabase.ts` reimplements this business logic (status monotonicity, session-gap stitching) against Postgres/RPCs rather than sharing code with the sqlite path, since the two stores don't share a query layer. Scope differs: local mode has one shared dataset; cloud mode scopes every row to the current account (via RLS), so this is all per-account there.

- `upsertProgress` (the playback heartbeat path) is monotonic once a lesson's status is `'completed'`: a later heartbeat at a lower position (rewind, rewatch) never downgrades it back. `markStatus` (manual override — Drive lessons, or fixing a stuck status) is explicitly *not* monotonic and can move status in any direction.
- `watch_events` rows are watch "sessions": a heartbeat extends the most recent event if the gap since its `ended_at` is ≤ 5 minutes, otherwise it opens a new session row. This is what powers the day-grouped History page.
- "Continue Learning" (`getContinueLearning`) is the most-recently-updated `in_progress` lesson, ordered by a monotonic `updated_seq` counter (not a timestamp, to break same-millisecond ties) — never `completed`, even mid-rewatch of a finished lesson.

### Routes

- Pages: `/` (Home / continue-learning), `/library` (browse + enroll, enroll UI only when `SUPPORTS_ENROLLMENT`), `/watch/[id]`, `/history`, `/login` (unauthenticated only — `proxy.ts` redirects here) — all except `/login` are `export const dynamic = "force-dynamic"` since everything renders from the active backend, not static generation.
- API: `/api/lessons`, `/api/lessons/[id]`, `/api/lessons/[id]/video`, `/api/lessons/[id]/progress`, `/api/lessons/[id]/mark-status`, `/api/lessons/[id]/reset`, `/api/lessons/[id]/enroll`, `/api/lessons/[id]/unenroll` (no-ops in local mode, see "Backend selection" above), `/api/continue-learning`, `/api/history`, `/api/health` (excluded from the `proxy.ts` auth gate).

### Testing (required for every code change)

**Every code change must ship with tests**: unit tests (Vitest, TDD-first — write the test before the implementation) for any new/changed `lib/**` business logic, and a Playwright e2e spec under `e2e/**` for anything touching a page, route, or user-facing flow. This is enforced by CI (`.github/workflows/ci.yml`'s `test` and `e2e` jobs), not just convention.

**Unit tests** — Vitest with `environment: "node"`. Local-mode-focused tests inject an in-memory `better-sqlite3` `Database` through the optional trailing `database` parameter that most `lib/lessons/sqlite.ts` functions accept (see `tests/lessons.test.ts`), rather than mocking the module-level `db` export from `lib/db.ts`. `tests/backend.test.ts` covers `lib/backend.ts`'s `DATA_BACKEND` validation/dispatch; `tests/auth-local.test.ts`/`tests/auth-index.test.ts` cover local-mode session/password handling; `tests/manifest.test.ts`, `tests/config.test.ts`, `tests/videoMatch.test.ts`, `tests/sync-sqlite.test.ts`, `tests/sync-index.test.ts` cover the manifest/config parsing, filename-matching, and sync-reconciliation logic. All run as part of the default `npm run test`.

`tests/cross-account-isolation.supabase.test.ts` is opt-in and does **not** run as part of `npm run test`: it's the correctness test for cloud mode's core new guarantee — that two accounts' enrollment/progress/history never leak into each other despite sharing the same lesson catalog. It needs a real local Supabase instance (`npx supabase start`, with `supabase/migrations/` applied) and self-skips (`describe.skipIf`) unless the three cloud-mode env vars are set. Run it explicitly:

```
DATA_BACKEND=supabase npx vitest run tests/cross-account-isolation.supabase.test.ts
```

**Coverage gate** — `npm run test:coverage` runs Vitest with `@vitest/coverage-v8` and fails under an 80% threshold (lines/functions/branches/statements), configured in `vitest.config.ts`. Scoped to `include: ["lib/**/*.ts"]` — business logic, matching where the unit suite already concentrates — not `app/**`/`components/**`, since there's no `@testing-library/react` here; that UI layer is exercised by the Playwright suite instead. Excluded from the scope (and from the 80% denominator) for the same reason `tests/cross-account-isolation.supabase.test.ts` above is opt-in: `lib/**/supabase.ts` and `lib/supabase/**` (cloud-mode code needs a live Supabase instance to test meaningfully) and `lib/watcher.ts` (chokidar fs-watching orchestration — thin wiring over the already-unit-tested pure matching logic in `lib/videoMatch.ts`).

**e2e tests** — Playwright, `playwright.config.ts`, `e2e/**/*.spec.ts`, Chromium only, run serially (`workers: 1`) since the whole suite shares one small fixture sqlite db and would otherwise race on the same lesson rows. Each spec is self-contained: state it depends on is set up via direct API calls (`page.request`/`request` fixture) rather than assuming another spec file ran first, and state it mutates is reset in `beforeEach`/`afterEach` (see `e2e/utils.ts`'s `resetFixtureLessons`).

Isolation from real dev data: three env vars — `DB_PATH`, `LESSONS_MANIFEST_PATH`, `APP_CONFIG_PATH` — override the otherwise-hardcoded `data/app.db`/`data/lessons.yaml`/`data/config.yaml` paths (`lib/db.ts`/`lib/manifest.ts`/`lib/config.ts`; defaults unchanged when unset, so normal dev/Docker usage is unaffected). `playwright.config.ts`'s `webServer` sets all three to point at `e2e/fixtures/data/` (3 minimal lessons covering the Drive-embed, local-video, and no-source cases — see `e2e/fixtures/data/lessons.yaml`) and boots `next dev` on port 3100 (not 3000, so it doesn't collide with a dev server already running). `e2e/global-setup.ts` deletes any stale fixture db before each full run; `e2e/auth.setup.ts` logs in once and saves `storageState` to `e2e/.auth/user.json` (gitignored), reused by the `chromium` project — specs that need to test unauthenticated flows (`e2e/auth.spec.ts`) override it per-file with `test.use({ storageState: { cookies: [], origins: [] } })`.

`npx playwright install --with-deps chromium` is a one-time local setup step (also run in CI) — not part of `npm install`, since the browser binary is large and shouldn't be pulled on every install.

### Lesson manifest (`data/lessons.yaml`)

Each entry needs `id` (stable, never change once history exists for it), `title`, `subject`, `order` (int, sorts within subject), and at least one of `localPath` (relative to the videos directory — `data/videos/` by default, or `videosDir` from `data/config.yaml` if set — or an absolute path) / `driveUrl` (share link or bare file id) — a lesson with neither still loads, shown as "no video source configured." The manifest itself is shared, mode-agnostic content; what happens to per-account/per-install state on sync differs: in local mode, new entries get a `not_started` `watch_progress` row automatically on next sync; in cloud mode, `lib/sync/supabase.ts` only reconciles the shared `lessons` catalog table — per-account `enrollments`/`watch_progress` rows are created lazily when an account enrolls, not pre-seeded at sync time.
