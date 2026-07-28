# Homeschool Video Tracker

A local-only web app for tracking homeschool video lesson progress: what's been watched, how far into each video, and lets you resume where you left off. Runs on your machine only — no internet-facing deployment, no auth.

Built with Next.js (App Router, TypeScript) and SQLite (`better-sqlite3`).

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server binds to `localhost` only (not `0.0.0.0`), so it's not reachable from other devices on your network.

`npm run build && npm run start` runs the same app in production mode, also bound to `localhost:3000`.

## Project layout

```
app/          — pages and API route handlers (app/api/...)
lib/          — db access, manifest parsing/sync logic
data/         — sqlite db file, lessons manifest, and data/videos/ for downloaded video files
```

## Where things live

- **Video files** go in `data/videos/`. See the manifest section below for how they get linked to lessons.
- **Lesson manifest** lives at `data/lessons.yaml` — this is where you list lessons by hand (title, subject, video source). Details on the format land here once the manifest/DB layer is built (next step in the build plan).
- **Database** is a SQLite file at `data/app.db`, created automatically on first run.

## Status

This is being built incrementally. Right now this is just the scaffold: project structure, health-check endpoint (`GET /api/health`), and a placeholder home page that calls it. Feature work (manifest, DB, video streaming, player, pages) comes next.
