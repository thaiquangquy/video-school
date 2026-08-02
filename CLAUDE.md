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
- `npx tsc --noEmit` — typecheck
- Docker: `docker build -t video-school .` then `docker run -d --name video-school -p 3000:3000 -v "$(pwd)/data:/app/data" video-school` — the bind-mount is what persists `data/lessons.yaml` edits, `data/videos/`, and the sqlite db across rebuilds; without it the container falls back to the `data/` baked into the image.

## Architecture

Local-only Next.js App Router app (no auth, not internet-facing, LAN only) for tracking homeschool video-lesson watch progress. SQLite (`better-sqlite3`) holds watch state; `data/lessons.yaml` is the source of truth for lesson *content*. These two are kept in sync, not merged: `lib/sync.ts` (`syncLessonsFromManifest`) reconciles the manifest into the `lessons` table on every server start (called from `instrumentation.ts`). Lessons removed from the manifest are archived, not deleted, so their `watch_progress`/`watch_events` history survives a re-add.

`data/config.yaml` (`lib/config.ts`) is separate, optional, app-level config: `driveFolderUrl` (a convenience link shown in the UI, not a data source — there's no Drive API key wired in, so unlike local files there's no live listing/auto-matching against a Drive folder) and `videosDir` (overrides the local video base directory, default `data/videos/` — e.g. pointing it at a Google Drive Desktop sync target to stream those files directly).

### Video source resolution

Each lesson resolves to a local file, a Drive URL, or nothing, in that priority order:

- `lib/watcher.ts` resolves `VIDEOS_DIR` once at module load from `data/config.yaml`'s `videosDir` (falling back to `data/videos/`), then starts a chokidar watch on it once per process (`startVideoWatcher()`, called from `instrumentation.ts`, idempotent). New files are matched to lessons that don't yet have a `local_path`, via `lib/videoMatch.ts`: normalize the filename and compare against normalized lesson `id`/`title`, trying exact-id → exact-title → segment-bounded-substring-id → segment-bounded-substring-title, first tier with any hits wins; multiple hits within a tier is reported ambiguous and left unmatched rather than guessed.
- `local_path_source` (`'manifest'` vs `'auto_matched'`) distinguishes an explicit `localPath` from a watcher-filled one — `sync.ts` checks this so a manifest re-sync doesn't null out an auto-matched path.
- If a linked file is later moved/deleted, `local_path` is cleared (watcher `unlink` handler + a `pruneMissingLocalFiles()` startup sweep) and the lesson falls back to `driveUrl` if set.
- `app/api/lessons/[id]/video/route.ts` streams local files with HTTP Range support (`lib/rangeRequest.ts` parses the `Range` header and produces 200/206/416 responses). With no `localPath`, it instead returns `{ source: "drive", driveUrl }` JSON. `components/VideoPlayer.tsx` branches on that: a real `<video>` for local playback (with resume + heartbeat progress posting), or a Drive `/preview` iframe with manual status buttons — Drive playback position can't be observed programmatically, so progress there is user-driven via `mark-status`.

### Progress/status model (`lib/lessons.ts`)

- `upsertProgress` (the playback heartbeat path) is monotonic once a lesson's status is `'completed'`: a later heartbeat at a lower position (rewind, rewatch) never downgrades it back. `markStatus` (manual override — Drive lessons, or fixing a stuck status) is explicitly *not* monotonic and can move status in any direction.
- `watch_events` rows are watch "sessions": a heartbeat extends the most recent event if the gap since its `ended_at` is ≤ 5 minutes, otherwise it opens a new session row. This is what powers the day-grouped History page.
- "Continue Learning" (`getContinueLearning`) is the most-recently-updated `in_progress` lesson, ordered by a monotonic `updated_seq` counter (not a timestamp, to break same-millisecond ties) — never `completed`, even mid-rewatch of a finished lesson.

### Routes

- Pages: `/` (Home / continue-learning), `/library`, `/watch/[id]`, `/history` — all `export const dynamic = "force-dynamic"` since everything renders from SQLite, not static generation.
- API: `/api/lessons`, `/api/lessons/[id]`, `/api/lessons/[id]/video`, `/api/lessons/[id]/progress`, `/api/lessons/[id]/mark-status`, `/api/lessons/[id]/reset`, `/api/continue-learning`, `/api/history`, `/api/health`.

### Testing

Vitest with `environment: "node"`. Tests inject an in-memory `better-sqlite3` `Database` through the optional trailing `database` parameter that most `lib/lessons.ts` functions accept (see `tests/lessons.test.ts`), rather than mocking the module-level `db` export from `lib/db.ts`.

### Lesson manifest (`data/lessons.yaml`)

Each entry needs `id` (stable, never change once history exists for it), `title`, `subject`, `order` (int, sorts within subject), and at least one of `localPath` (relative to the videos directory — `data/videos/` by default, or `videosDir` from `data/config.yaml` if set — or an absolute path) / `driveUrl` (share link or bare file id) — a lesson with neither still loads, shown as "no video source configured." New entries get a `not_started` `watch_progress` row automatically on next sync.
