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

### Using it on an iPad (PWA)

This app is installable as a Progressive Web App. On the iPad, open `http://<your-mac's-lan-ip>:3000` in Safari, tap the Share icon, then "Add to Home Screen." It'll launch full-screen like a native app, with its own icon.

## Project layout

```
app/          — pages and API route handlers (app/api/...)
lib/          — db access, manifest parsing/sync logic
data/         — sqlite db file, lessons manifest, and data/videos/ for downloaded video files
```

## Where things live

- **Video files** go in `data/videos/`. See below for how they get linked to lessons.
- **Lesson manifest** lives at `data/lessons.yaml` — this is where you list lessons by hand.
- **Database** is a SQLite file at `data/app.db`, created automatically on first run.

## Lesson manifest format (`data/lessons.yaml`)

The manifest is the source of truth for lesson *content* (title, subject, ordering, video source). The database stores *watch state* (progress, status, history) separately, keyed by the lesson's `id`.

Each entry:

| Field       | Required | Notes                                                                                                   |
|-------------|----------|-----------------------------------------------------------------------------------------------------------|
| `id`        | yes      | Stable string you assign, e.g. `math-fractions-01`. Don't change it once you've started tracking watch history for that lesson. |
| `title`     | yes      | Display title.                                                                                          |
| `subject`   | yes      | Grouping used on the Library page, e.g. `Math`, `Reading`.                                              |
| `tags`      | no       | List of free-form tags.                                                                                 |
| `localPath` | no       | Path to the video file, relative to `data/videos/` (or absolute). Leave it out if not downloaded yet — the folder watcher fills it in automatically once a matching file shows up (see below). |
| `driveUrl`  | no       | A Google Drive share link or bare file id, used until/unless a local file exists.                       |
| `order`     | yes      | Integer used to sort lessons within a subject group.                                                     |

A lesson needs at least one of `localPath` / `driveUrl` to be watchable.

To add a new lesson: add an entry to `data/lessons.yaml` and restart the server (or wait for the next scheduled sync) — it'll be picked up and given a `not_started` watch_progress row automatically. Removing an entry from the manifest doesn't delete its watch history; the lesson is archived (kept in the DB, hidden from the UI) so history stays intact if you ever re-add it.

## Adding video files (auto-matching)

Drop downloaded video files into `data/videos/`. A background watcher matches new files to lessons that don't have a `localPath` yet, and fills it in for you — no manifest edit needed, and no server restart needed (it picks up files dropped in while the server is running, and also does a full scan on startup so files added while the server was down get picked up too).

**Name your video file after the lesson `id`** for a reliable match (e.g. `math-fractions-01.mp4` for lesson id `math-fractions-01`). Matching is normalized (case-insensitive, punctuation/spacing collapsed), so `Math - Fractions 01.mp4` also matches. If no lesson id matches, it'll try matching against the lesson's `title` instead. If a file doesn't match anything, it's left alone and a warning is logged to the server console with the filename — check there if a file doesn't seem to be linking up, rather than the app guessing wrong and mislinking two lessons.

If a lesson's linked video file is later moved or deleted, its `localPath` is automatically cleared (also logged) and the app falls back to `driveUrl` if one is set.

## API

| Endpoint                             | Method | Notes                                                                                     |
|---------------------------------------|--------|---------------------------------------------------------------------------------------------|
| `/api/lessons`                        | GET    | All lessons with their current watch_progress joined in.                                  |
| `/api/lessons/:id`                    | GET    | Single lesson detail + progress.                                                          |
| `/api/lessons/:id/video`              | GET    | Streams the local file with HTTP Range support if `localPath` is set; otherwise returns `{ source: "drive", driveUrl }` for the frontend to embed directly. |
| `/api/lessons/:id/progress`           | POST   | `{ positionSeconds, durationSeconds, source }`. Upserts watch_progress, flips to `completed` at ≥95% duration, appends/extends a watch_events session row. |
| `/api/lessons/:id/mark-status`        | POST   | `{ status }`. Manual override, mainly for Drive-sourced lessons where progress can't be auto-detected. |
| `/api/continue-learning`              | GET    | The most-recently-watched `in_progress` lesson (never `completed`), plus 2-3 "up next" suggestions by manifest order. |
| `/api/history`                        | GET    | `?limit=20&offset=0`. watch_events joined with lesson title/subject, most recent first.   |

## Testing

```bash
npm run test
```

Covers the progress-upsert status logic (completion threshold, the "never downgrade from completed" rule) and the HTTP Range-header parsing used by the video streaming route.

## Status

Being built incrementally, following the build plan. Done so far: project scaffold, health-check endpoint, manifest + SQLite schema + startup sync, folder watcher with filename auto-matching, PWA support (installable on iPad), lessons/progress API with range-request video streaming. Feature work (video player, pages) comes next.
