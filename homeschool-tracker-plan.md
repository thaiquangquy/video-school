# Homeschool Video Tracker — Architecture & Build Plan

## 1. What this is

A local-only web app that tracks your daughter's homeschool video lessons: what she's watched, how far into each video she got, and lets her (or you) resume from where she left off. Runs on your machine only, no internet-facing deployment, no auth needed.

## 2. Decisions locked in

- **Stack:** Next.js (App Router, TypeScript) + SQLite (`better-sqlite3`). Single project instead of a separate Express API + Vite React client — Next.js Route Handlers give you the API, React Server/Client Components give you the UI, and file-based routing covers Home / Library / Watch / History without wiring up React Router yourself. Fewer moving parts for a project you're the only maintainer of, and it still streams video with range-request support fine via Route Handlers. Runs with `npm run dev` locally, binds to `localhost` only.
- **Video catalog:** a manifest file you hand-maintain (`lessons.json` or `.yaml`) — each entry has an id, title, subject/tags, local file path (if downloaded), and a Google Drive URL/file id (as fallback or for lessons not yet downloaded). You still curate the manifest by hand (order, titles, subjects) — but see below, the *local file path* portion of it can now fill itself in.
- **Local file auto-match:** a folder watcher watches your local videos directory. When a new file shows up, it's matched to a manifest entry by filename (normalized comparison against the lesson's `id` or `title`) and that lesson's `localPath` is set automatically — you don't have to hand-edit the manifest every time you finish downloading something from Drive. Unmatched files are logged so you notice and can fix a naming mismatch or add a new manifest entry.
- **Profile:** single learner, no multi-user switching. One watch-history table, one "last watched" state.
- **"Continue Learning" behavior:** completed lessons never reappear in that slot, even if rewatched. This is a hard rule now, not a toggle — if she replays a finished lesson, it stays marked `completed` and "Continue Learning" only ever surfaces `in_progress` (or empty state if nothing is in progress).

## 3. Key technical constraint (this changes the design)

I checked whether Google Drive's video preview iframe exposes a JS API like YouTube's `postMessage`-based IFrame API (which gives you `getCurrentTime()`, `seekTo()`, play/pause events). **It doesn't.** Google never published a progress/control API for the Drive preview embed — that's a YouTube-only feature. Practically:

- **Local files** (downloaded to disk, served via your own backend): full control. Use a native HTML5 `<video>` element, listen to `timeupdate`, persist progress every few seconds, and `seek()` on load to resume exactly. This is the primary, reliable path.
- **Google Drive embeds** (before you've downloaded a lesson, or as fallback): you can embed the file via `https://drive.google.com/file/d/<id>/preview` in an iframe, but you get **no read-back** of playback position or completion from inside that iframe. The best you can do without it:
  - Track "opened this lesson" and "time since opened" as a coarse proxy (not real position).
  - Let the user manually mark a Drive-sourced lesson as "in progress" / "completed" via a button, since you can't detect it automatically.
  - Once you download the file locally, the app should automatically prefer the local path and switch to full tracking. With the new folder-watcher auto-match (see above), this handoff now happens on its own — drop the file in the videos folder, the manifest's `localPath` gets filled in, and the next time that lesson is opened it plays locally with full tracking instead of the Drive iframe.

This means: don't over-invest in trying to squeeze progress data out of the Drive iframe. Build real tracking for local playback, and treat Drive playback as a lightweight placeholder state until the file is downloaded.

## 4. Data model (SQLite)

**lessons** (synced from the manifest file, manifest is source of truth for content, DB stores watch state and the auto-matched local path)
- id (matches manifest id)
- title, subject, tags, duration_seconds (optional, can be probed from the local file with ffprobe — see Roadmap)
- local_path (nullable — can come from the manifest directly, or get filled in automatically by the folder watcher)
- local_path_source: `manifest` | `auto_matched` (so you can tell whether you set it or the watcher did)
- drive_url (nullable)

**watch_progress**
- lesson_id (FK)
- position_seconds (float) — only meaningful for local playback
- duration_seconds
- status: `not_started` | `in_progress` | `completed`
- last_watched_at (timestamp)
- source_last_played: `local` | `drive`

**watch_events** (optional, for the history page to show a real timeline, not just "last state")
- lesson_id, started_at, ended_at (or last heartbeat), source

"Continue learning" = the lesson with the most recent `last_watched_at` where `status = 'in_progress'`. Completed lessons are permanently excluded from this slot, full stop — no tie-break logic needed.

## 5. Pages / UI

- **Home:** "Continue Learning" card (thumbnail/title of last-watched in-progress lesson + resume button; never shows a completed lesson), plus maybe "Up Next" suggestions from the manifest order.
- **Library:** full list of lessons from the manifest, grouped by subject, with status badges (not started / in progress % / completed).
- **Watch page:** the actual player — local `<video>` with custom controls, or Drive iframe fallback, with a persistent progress bar under it showing your own tracked state (since Drive's own scrubber position isn't queryable, don't rely on it — track via a manual "mark progress" affordance for Drive-only videos).
- **History:** reverse-chronological list of watch sessions/lessons touched, with dates and progress at time of last view.

## 6. Prompt set for Claude Code

Feed these one at a time, in order. Each assumes the previous step's code exists. Adjust file paths as your project layout evolves.

---

### Prompt 1 — Project scaffold

```
Set up a local-only full-stack web app for tracking homeschool video lesson progress, using Next.js (App Router, TypeScript) and SQLite via better-sqlite3.

Structure:
- /app — pages and API route handlers (app/api/...)
- /lib — db access, manifest parsing/sync logic
- /data — sqlite db file, lessons manifest file, and a /data/videos folder for downloaded video files
- Single package.json, npm run dev starts the Next.js dev server

Requirements:
- Dev server binds to localhost only, default port 3000
- No authentication — this is a single-user local tool
- Add a README explaining how to run it (npm install, npm run dev) and where to put video files and the manifest

Don't build any features yet beyond a health-check route (GET /api/health) and a placeholder home page that fetches and displays it. I'll direct feature work in follow-up prompts.
```

---

### Prompt 2 — Manifest + DB schema + sync

```
Add the lesson manifest and database layer.

1. Define a manifest file at /data/lessons.yaml (or .json, your call) where I list lessons manually. Each entry:
   - id (string, stable, I'll assign these)
   - title
   - subject (string, e.g. "Math", "Reading")
   - tags (optional array)
   - localPath (optional, relative path under /data/videos/ or an absolute path — support both; this field may also get filled in automatically later by a folder watcher, so treat it as "current known local path" rather than strictly hand-authored)
   - driveUrl (optional, a Google Drive share link or file id)
   - order (integer, for sorting within a subject)

   Include 4-5 example entries as a starter template with placeholder values and comments explaining each field.

2. Set up SQLite (better-sqlite3) with these tables:
   - lessons: id, title, subject, tags, local_path, local_path_source ('manifest'|'auto_matched'), drive_url, order_index, duration_seconds (nullable)
   - watch_progress: lesson_id (FK, unique), position_seconds, duration_seconds, status ('not_started'|'in_progress'|'completed'), last_watched_at, source_last_played ('local'|'drive')
   - watch_events: id, lesson_id, started_at, ended_at, source

3. Write a sync function that runs on server startup: reads the manifest, upserts into `lessons` table (manifest is source of truth for content fields; if the manifest doesn't specify localPath but a previous auto-match already set one in the DB, don't overwrite it with null — merge, don't clobber), and creates a `watch_progress` row with status 'not_started' for any new lesson that doesn't have one yet. Don't delete watch_progress for lessons removed from the manifest — just stop surfacing them (or mark them archived, your call, explain which you picked).

4. Add a migration/init script that creates tables if they don't exist (idempotent, runs on every server start).

Explain the manifest format in the README so I know how to add new lessons.
```

---

### Prompt 3 — Local folder watcher & filename auto-match

```
Add a background watcher (chokidar) that watches /data/videos for new video files and automatically links them to manifest lessons that don't yet have a localPath (or whose file went missing).

Matching logic:
- Normalize both the incoming filename (strip extension, lowercase, collapse whitespace/punctuation to a single separator) and each lesson's id and title the same way.
- If the normalized filename matches a lesson's normalized id or title exactly, or contains it as a substring (whichever is more robust — use your judgment, but bias toward exact/near-exact matches over fuzzy ones to avoid wrong auto-links), set that lesson's local_path to the new file's path and local_path_source to 'auto_matched'.
- If a file doesn't match any lesson, log a clear warning to the console (filename, and that it was left unmatched) rather than guessing — don't ever auto-create a new lesson from an unmatched file.
- If a lesson already has a local_path pointing at a file that no longer exists on disk, clear it back to null (and log it) so the app correctly falls back to the driveUrl until a matching file reappears.

Run this watcher when the Next.js server starts (dev and prod), and also do an initial full scan of /data/videos on startup (not just watch for new events) so files dropped in while the server was down get picked up too.

Add a short section to the README explaining this: how filenames should be named to auto-match (recommend naming local files after the lesson id), and that unmatched files show up as console warnings.
```

---

### Prompt 4 — Lessons + progress API

```
Build the API (Next.js Route Handlers) for lessons and progress tracking.

Endpoints:
- GET /api/lessons — list all lessons with their current watch_progress joined in (status, position_seconds, duration_seconds, last_watched_at)
- GET /api/lessons/:id — single lesson detail + progress
- GET /api/lessons/:id/video — if local_path is set, stream the video file with proper HTTP range request support (required for seeking to work in the <video> tag); if no local_path, return the drive_url and let the frontend embed it directly
- POST /api/lessons/:id/progress — body: { positionSeconds, durationSeconds, source }. Upserts watch_progress, sets status to 'in_progress' if position < ~95% of duration, 'completed' if >=. Updates last_watched_at. Also append/update a watch_events row for the current session (create one on first heartbeat after a gap of >5 min since last heartbeat, otherwise update ended_at on the existing open one).
- POST /api/lessons/:id/mark-status — body: { status }. Manual override, mainly for Drive-sourced lessons where we can't auto-detect progress (see below).
- GET /api/continue-learning — returns the single most-recently-watched lesson where status = 'in_progress' (never 'completed' — that's a hard rule, no exceptions for rewatching), or null if none. Also return the 2-3 next lessons by manifest order as "up next" suggestions.
- GET /api/history — returns watch_events joined with lesson title/subject, most recent first, paginated (limit/offset).

Range request support on the video streaming route is important — without it, seeking/scrubbing in the browser won't work properly. Implement it with a readable stream over the file, parsing the Range header manually and returning a proper 206 Partial Content response with Content-Range/Content-Length/Accept-Ranges headers.

Write a couple of basic tests for the progress upsert logic and the range-request streaming.
```

---

### Prompt 5 — Video player component (dual source)

```
Build a client-side VideoPlayer component (Next.js Client Component) that supports two sources:

1. Local file (served from /api/lessons/:id/video): render a native <video> element pointed at that URL. On mount, if the lesson has a saved position_seconds > a few seconds, seek to it once metadata loads (auto-resume, no confirmation prompt, but log it so I can change my mind later). Listen to `timeupdate`, throttle to once every 5 seconds, and POST to /api/lessons/:id/progress with the current position. Also send a final update on pause/unmount/beforeunload so we don't lose the last few seconds.

2. Google Drive source (no local_path): embed via iframe pointed at https://drive.google.com/file/d/<id>/preview. Important: there is no API to read playback position from this iframe, so don't try to build automatic progress tracking for it. Instead show a small control panel next to the iframe with three buttons: "Just started" / "In progress" / "Mark completed" that call /api/lessons/:id/mark-status. Make this visually clear as a manual-tracking mode so it's not confusing that it behaves differently from local playback.

Both modes should show a progress bar / status badge sourced from the backend's watch_progress state, not from the player itself (important for the Drive case where there's no other source of truth).

Handle the file-id extraction from whatever driveUrl format I put in the manifest (support both a full share link and a bare file id).
```

---

### Prompt 6 — Home page (Continue Learning) + Library page

```
Build two pages using the App Router:

1. Home page (app/page.tsx): calls /api/continue-learning. If there's a lesson in progress, show a prominent "Continue Learning" card — title, subject, a progress bar (position/duration), and a "Resume" button that navigates to the watch page for that lesson (which should auto-load at the saved position per the VideoPlayer behavior already built). Completed lessons must never appear in this slot, even if the most recently watched thing overall was a completed rewatch — the API already enforces this, but don't add any frontend logic that could override it. If nothing is in progress, show a friendly empty state and surface the first lesson by manifest order as "Start here" instead. Below that, show the 2-3 "up next" suggestions as smaller cards.

2. Library page (app/library/page.tsx): list all lessons grouped by subject (per the manifest's subject field), each as a card showing title, a status badge (Not started / In progress X% / Completed, with a checkmark icon for completed), and a click-through to the watch page. Sort within each subject group by the manifest's order field.

Use Next.js's built-in routing (Link, app directory structure) for navigation between Home / Library / Watch/[id] / History (History comes in the next prompt) — no need for React Router. Keep styling simple and clean — plain CSS or a minimal utility approach, no need for a heavy component library for a personal local tool.
```

---

### Prompt 7 — History page

```
Build a History page (app/history/page.tsx) that calls /api/history and shows a reverse-chronological list of watch sessions: date, lesson title, subject, source (local/drive), and how far the video got at that session (position/duration or a percentage). Paginate with a simple "Load more" button (20 per page). Group by day if that's easy (e.g. "Today", "Yesterday", "Jul 24, 2026") for readability.

Add a small summary strip at the top: total lessons completed, total distinct lessons touched, and total watch time this week (sum of session durations from watch_events where ended_at - started_at, this week = last 7 days).
```

---

### Prompt 8 — Polish pass

```
Do a polish pass:

1. Handle edge cases: lesson in manifest with neither localPath nor driveUrl (show as "no video source configured" in Library, don't crash the watch page). Video file path in manifest/DB that doesn't actually exist on disk (the folder watcher should already null it out per Prompt 3, but double check the streaming route also fails gracefully with a clear 404 if it somehow still happens).
2. Add a "reset progress" action on the watch page (small, tucked away, with a confirm) in case a position gets stuck wrong.
3. Basic responsive layout check — this'll mostly be viewed on a laptop/tablet at home, so no need for a full mobile-first pass, just make sure nothing breaks under ~1000px width.
4. Double check the range-request video streaming actually allows scrubbing forward/backward smoothly on a real local video file — test with a file over 500MB if you have one, since naive implementations sometimes only work for small files.
5. Write a short "how to add a new lesson" note in the README: edit lessons.yaml, drop the video file into /data/videos named to match the lesson id — the watcher picks it up without a restart.
```

---

## 7. Roadmap (not in the prompt set above — feed these later, once the core flow is solid)

- **Real duration + thumbnails for local files (ffprobe/ffmpeg).** Right now `duration_seconds` is optional/manual and there's no thumbnail. Once the core app works end to end, this is worth adding — probing local files during the folder-watcher's match step and generating a thumbnail frame. Requires `ffmpeg`/`ffprobe` installed on your machine. Suggested follow-up prompt for Claude Code when you're ready:

  ```
  Add duration and thumbnail generation for locally-matched video files. When the folder watcher (from the earlier prompt) auto-matches or the manifest sync links a localPath, run ffprobe to get the real duration_seconds and store it, and use ffmpeg to grab a single frame (e.g. at 10% into the video) as a thumbnail, saved to /data/thumbnails/<lessonId>.jpg. Serve thumbnails via a simple static route and show them on the Library and Continue Learning cards instead of the current placeholder. Check for ffmpeg/ffprobe on startup and log a clear warning (not a crash) if they're missing, since this is an optional enhancement.
  ```

## 8. Notes

Sources checked: Google's own iframe API docs are YouTube-specific ([YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)) — there is no equivalent Google-published API for the Drive preview embed, confirming the local-file-first design above.
