# Homeschool Video Tracker

A local-only web app for tracking homeschool video lesson progress: what's been watched, how far into each video, and lets you resume where you left off. Runs on your home network only — no auth, no internet-facing deployment.

Built with Next.js (App Router, TypeScript) and SQLite (`better-sqlite3`).

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on the machine running the server. The dev server binds to `0.0.0.0`, so it's also reachable from other devices on the same WiFi network — e.g. an iPad — at `http://<your-mac's-lan-ip>:3000` (find the IP with `ipconfig getifaddr en0` on macOS). It is **not** reachable from the internet, only from devices on your local network.

`npm run build && npm run start` runs the same app in production mode, same binding.

## Dev vs. stable (this household's actual setup)

This repo is checked out twice on this machine, so active development never risks
breaking what the family is using:

- **This directory** (`main` branch) — what the family actually uses (stable/
  production), running a built `next start` at `http://localhost:23000` (and
  `http://<lan-ip>:23000` on the WiFi, same reachability model as above).
  `.env` (not committed) holds `DATA_BACKEND=sqlite`, `APP_PASSWORD`, and
  `SESSION_SECRET` for this deployment — set up once and left alone; changing
  the household password means editing that file and restarting. `data/app.db`
  here is the real, long-running household history — never point test/dev
  tooling at it.
- **`../video-school-dev`** (a `git worktree` checked out to the `dev`
  branch) — active development, `npm run dev` here. A genuinely separate
  directory — its own `node_modules`, `.next` build, and `data/` (own sqlite
  db; dev's testing never touches the family's real data) — so `next dev`'s
  live rebuilds there can't collide with the `next start` process serving the
  family from here. `data/config.yaml`'s `videosDir` is an absolute path, so
  both checkouts resolve the same real video files.

**Promote dev to stable**, once you're satisfied a set of changes is tested and
ready to ship — run this in **this** directory (`main`):

```bash
git merge --ff-only dev   # fails loudly if this isn't a fast-forward
npm ci                     # only needed if package.json changed
npm run build
```

(The `"next start" does not work with "output: standalone"` warning during the
build is expected here and harmless — that config is for the Docker image
below; a plain `next start` still runs the app correctly, just without that
optimization.)

**Restart the running stable server** after promoting+building:

```bash
lsof -nP -iTCP:23000 -sTCP:LISTEN   # find the current server's PID
kill <pid>

nohup npx next start -H 0.0.0.0 -p 23000 > server.log 2>&1 &
disown
```

## Running with Docker

One image supports both data backends (`sqlite` local mode, `supabase` cloud mode —
see `docs/supabase-integration-plan.md` for the full dual-backend design), but with
an important asymmetry: `DATA_BACKEND`, `APP_PASSWORD`/`SESSION_SECRET`, and
`SUPABASE_SERVICE_ROLE_KEY` are pure runtime env vars (`docker run -e ...`, no
rebuild needed to change them). `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
are different — `next build` inlines them into the JS bundle, so cloud-mode
deployments need their own image build with those passed as `--build-arg`; a
local-mode image can't be flipped into cloud mode with just `docker run -e`.

### Local mode (default, sqlite)

```bash
docker build -t video-school .
docker run -d --name video-school -p 3000:3000 \
  -e DATA_BACKEND=sqlite -e APP_PASSWORD=... -e SESSION_SECRET=... \
  -v "$(pwd)/data:/app/data" video-school
```

Bind-mounting `./data` is what makes this behave like the local setup: it's the same
`data/lessons.yaml` you edit, the same `data/videos/` you drop files into, and the
sqlite db persists across container restarts/rebuilds. Without the `-v` flag the
container still runs, but starts from the manifest baked into the image and loses
its db each time the container is removed.

### Cloud mode (supabase)

```bash
docker build -t video-school \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
docker run -d --name video-school -p 3000:3000 \
  -e DATA_BACKEND=supabase -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -v "$(pwd)/data:/app/data" video-school
```

The two `NEXT_PUBLIC_*` vars are passed at both build and run time — build time so
they get inlined into the bundle, run time because server-side code also reads
`process.env` directly for these, so pass both to avoid confusion about which one
"actually" controls behavior. The `data/` volume is still needed in cloud mode for
`data/lessons.yaml`/`data/videos/`, just not for a sqlite db. No self-hosted
Supabase Docker stack — cloud mode always points at a real Supabase Cloud project.

Open `http://localhost:3000`, or `http://<host-lan-ip>:3000` from another device on
the network (same reachability model as `npm run dev`/`start` — LAN only, not
internet-facing).

To update after pulling code changes: rerun the matching `docker build` command
above, then `docker rm -f video-school` and re-run the `docker run` command.

### Using it on an iPad (PWA)

This app is installable as a Progressive Web App. On the iPad, open `http://<your-mac's-lan-ip>:3000` in Safari, tap the Share icon, then "Add to Home Screen." It'll launch full-screen like a native app, with its own icon.

## How to add a new lesson

1. Add an entry to `data/lessons.yaml` (see the format below).
2. Drop the video file into `data/videos/`, named to match the lesson's `id` (e.g. `math-fractions-01.mp4`).

That's it — the folder watcher picks up the file and links it automatically, no restart needed. If you haven't downloaded the video yet, set `driveUrl` in the manifest instead and it'll play from Google Drive until you do.

## Project layout

```
app/          — pages and API route handlers (app/api/...)
components/   — shared React components (video player, lesson cards, etc.)
lib/          — db access, manifest parsing/sync logic, folder watcher
data/         — sqlite db file, lessons manifest, and data/videos/ for downloaded video files
tests/        — vitest unit tests
```

## Pages

- **Home** (`/`) — "Continue Learning" card for the most recently in-progress lesson (never a completed one, even mid-rewatch), or a "Start Here" prompt if nothing's in progress, plus "Up Next" suggestions.
- **Library** (`/library`) — every lesson, grouped by subject, with status badges.
- **Watch** (`/watch/[id]`) — the player: local `<video>` with resume/progress-tracking, or a Google Drive embed with manual status buttons. Has a small "Reset progress" link if a lesson's tracked position ever gets stuck wrong.
- **History** (`/history`) — a day-grouped, paginated log of watch sessions, with a summary strip (lessons completed, lessons touched, watch time this week).

## Lesson manifest format (`data/lessons.yaml`)

The manifest is the source of truth for lesson *content* (title, subject, ordering, video source). The database stores *watch state* (progress, status, history) separately, keyed by the lesson's `id`.

Each entry:

| Field       | Required | Notes                                                                                                   |
|-------------|----------|-----------------------------------------------------------------------------------------------------------|
| `id`        | yes      | Stable string you assign, e.g. `math-fractions-01`. Don't change it once you've started tracking watch history for that lesson. |
| `title`     | yes      | Display title.                                                                                          |
| `subject`   | yes      | Grouping used on the Library page, e.g. `Math`, `Reading`.                                              |
| `tags`      | no       | List of free-form tags.                                                                                 |
| `localPath` | no       | Path to the video file, relative to the videos directory (`data/videos/` by default, or `videosDir` from `data/config.yaml` if set — see below), or absolute. Leave it out if not downloaded yet — the folder watcher fills it in automatically once a matching file shows up (see below). |
| `driveUrl`  | no       | A Google Drive share link or bare file id, used until/unless a local file exists.                       |
| `order`     | yes      | Integer used to sort lessons within a subject group.                                                     |

A lesson needs at least one of `localPath` / `driveUrl` to be watchable — one with neither shows up in the Library as "no video source configured" rather than crashing anything.

New manifest entries are picked up on the next server start and given a `not_started` watch_progress row automatically. Removing an entry from the manifest doesn't delete its watch history; the lesson is archived (kept in the DB, hidden from the UI) so history stays intact if you ever re-add it.

## Adding video files (auto-matching)

Drop downloaded video files into `data/videos/`. A background watcher matches new files to lessons that don't have a `localPath` yet, and fills it in for you — no manifest edit needed, and no server restart needed (it picks up files dropped in while the server is running, and also does a full scan on startup so files added while the server was down get picked up too).

**Name your video file after the lesson `id`** for a reliable match (e.g. `math-fractions-01.mp4` for lesson id `math-fractions-01`). Matching is normalized (case-insensitive, punctuation/spacing collapsed), so `Math - Fractions 01.mp4` also matches. If no lesson id matches, it'll try matching against the lesson's `title` instead. If a file doesn't match anything, it's left alone and a warning is logged to the server console with the filename — check there if a file doesn't seem to be linking up, rather than the app guessing wrong and mislinking two lessons.

If a lesson's linked video file is later moved or deleted, its `localPath` is automatically cleared (also logged) and the app falls back to `driveUrl` if one is set. Requesting a video whose file has gone missing on disk (without the watcher having caught it yet) returns a clean 404 rather than crashing the watch page.

### Using an external videos directory (e.g. Google Drive Desktop)

By default the watcher watches `data/videos/`. To stream files directly from elsewhere — for example a folder synced locally by Google Drive Desktop, without downloading a separate copy — set `videosDir` in `data/config.yaml` to an absolute path:

```yaml
videosDir: "/Users/you/Library/CloudStorage/GoogleDrive-you@example.com/My Drive/some-folder"
```

Everything else works the same: `localPath` values in the manifest resolve relative to this directory instead of `data/videos/`, and the folder watcher/auto-matcher watches it instead. This is a machine-specific setting — it only makes sense on the machine where that path actually exists, and it isn't picked up inside the Docker container (whose `videosDir` would need to resolve to a path bind-mounted into the container).

## Google Drive source folder (`data/config.yaml`)

Videos not yet downloaded locally can play from Google Drive via each lesson's `driveUrl` (see manifest format below). To make it easy to find the right file, set `driveFolderUrl` in `data/config.yaml` to the parent Drive folder they're kept in:

```yaml
driveFolderUrl: "https://drive.google.com/drive/folders/11tTJmzxFeoiRLhkV6gDRJ89Uhx6vvJG1"
```

There's no Drive API key configured, so the app can't list the folder's contents or auto-match files to lessons the way the local folder watcher does. Instead, any lesson with no video source configured shows a "Browse the source folder on Google Drive" link on its Watch page — open it, find the file, copy its share link, and paste it into that lesson's `driveUrl` in `data/lessons.yaml`. `data/config.yaml` is optional; without it (or without `driveFolderUrl` set), that link is simply omitted.

## API

| Endpoint                       | Method | Notes                                                                                     |
|---------------------------------|--------|---------------------------------------------------------------------------------------------|
| `/api/lessons`                  | GET    | All lessons with current watch progress joined in.                                        |
| `/api/lessons/:id`               | GET    | Single lesson + progress. 404 if unknown/archived.                                        |
| `/api/lessons/:id/video`         | GET    | Streams the local file with HTTP Range support if `localPath` is set; otherwise returns `{ source: "drive", driveUrl }` JSON for the frontend to embed. 404 if no source configured, or if the file is missing on disk. |
| `/api/lessons/:id/progress`      | POST   | `{ positionSeconds, durationSeconds, source }`. Upserts progress, flips to `completed` at ≥95% duration. Once completed, later heartbeats never downgrade the status back down, even on rewatch. |
| `/api/lessons/:id/mark-status`   | POST   | `{ status }`. Manual override (for Drive lessons, or to fix a stuck status) — unlike the progress heartbeat, this can move status in any direction, including back down from completed. |
| `/api/lessons/:id/reset`         | POST   | Resets a lesson's progress back to `not_started` (position/duration/status/last-watched all cleared). Watch history in `/api/history` is untouched. |
| `/api/continue-learning`        | GET    | `{ continueLearning, upNext }`. `continueLearning` is the most-recently-watched `in_progress` lesson, or `null` — never `completed`. `upNext` is the next lessons by manifest order. |
| `/api/history`                  | GET    | `?limit=20&offset=0`. Watch sessions, most recent first, with lesson title/subject joined in. First page also includes a `summary` object. |

## Testing

```bash
npm run test
```

Covers the progress-upsert status logic (completion threshold, the "never downgrade from completed" rule, session/event bucketing) and the HTTP Range-header parsing used by the video streaming route.

## Status

Feature-complete per the build plan: manifest + SQLite + startup sync, folder watcher with filename auto-matching, PWA support (installable on iPad), lessons/progress API with range-request video streaming, dual-source video player (local + Drive), Home/Library/Watch/History pages, and edge-case handling (no video source, missing files, stuck progress reset).
