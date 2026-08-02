# Populate real ABEKA K5 Phonics lessons from Google Drive

## Context

The app already has full support for playing a lesson from Google Drive (built in an earlier session): `VideoPlayer.tsx` embeds a `/preview` iframe for any lesson with a `driveUrl` and no local file, with manual status buttons since Drive playback position can't be tracked. `data/config.yaml`'s `driveFolderUrl` already points at this exact folder as a browsing convenience link. **No playback code needs to change** — this task is entirely about populating `data/lessons.yaml` with real content.

The user gave a Drive folder URL (`https://drive.google.com/drive/folders/11tTJmzxFeoiRLhkV6gDRJ89Uhx6vvJG1`) believing it held one `.mp4` "lesson." Browsing it live (the user is logged into the owning-ish Google account; it's actually a folder shared with them: `Shared with me > Abeka (fb.com/groups/freebook4kids) > 02. ABEAKA K5 > ABEKA-K5-PHONIC`) showed it's a full curriculum. I scrolled the real Drive UI to the true bottom and extracted every row's file id + filename directly from the DOM (`[data-id]` + `aria-label`, since Drive's list is virtualized and synthetic scroll/wheel events don't load more rows — only genuine mouse-wheel scroll via the `computer` tool does). Confirmed count: **246 `.mp4` files**, numbered `1`, `2`, `3A`/`3B`, `4A`/`4B`, ... up to `160` (numbering has gaps and some entries are single/A/B — not a clean 1:1 sequence, hence 246 files despite the highest number being 160). The user confirmed this matches what they see scrolling manually, and asked to (a) import all of them as one lesson per file, (b) drop the 5 placeholder/example lessons currently in the manifest, and (c) keep the naming/structure clean so another topic (a sibling Drive folder) can be added the same way later.

## Approach

### 1. Get the full {filename, fileId} list out of the browser without truncation

The Drive tab is already scrolled to the bottom with all 246 rows present in the DOM (this state won't survive to the next session, so this step needs re-running: navigate to the folder URL, scroll to the bottom with genuine mouse-wheel scroll via the `computer` tool — synthetic scroll/wheel events do NOT trigger Drive's virtualized list to load more rows, only real scroll does). `javascript_tool` truncates return values around ~1500 chars, too small for 246 rows. Instead, run JS in that tab that builds the `name|id` list (dedup by `data-id`, label from `aria-label` on the element or a descendant, filtered to `.mp4`, sorted by numeric prefix then A/B suffix) and triggers a `Blob` + anchor `download`, saving a text file to the user's Downloads folder. Then `Read` that file from disk to get the authoritative list — cross-check the line count is 246 before using it.

### 2. Generate manifest entries

Write a throwaway Node script (scratchpad only, not committed) that reads the downloaded `name|id` file and emits YAML lesson entries following the existing schema (`lib/manifest.ts` / `data/lessons.yaml` fields: `id`, `title`, `subject`, `driveUrl`, `order` — no `localPath`, matching how the current example `driveUrl` entries look):

- `id`: `phonics-` + zero-padded numeric part + lowercase A/B suffix if present, e.g. `phonics-001`, `phonics-003a`, `phonics-160`. Stable, sortable, traceable back to the source filename.
- `title`: `"Phonics " + <number><suffix>` (e.g. "Phonics 1", "Phonics 3A") — the curriculum's own filmed numbering; there's no richer per-lesson title available from Drive, so this is what's used until/unless the user wants to rename individual lessons later.
- `subject`: `"Phonics"`.
- `order`: sequential 1..246 following the sorted (numeric, then A before B) order — matches curriculum progression.
- `driveUrl`: the bare Drive file id (existing pattern already supports bare ids, e.g. today's `reading-phonics-01` example entry).

### 3. Replace the manifest

Read the current `data/lessons.yaml`, and replace its 5 placeholder lessons (`math-counting-01`, `math-fractions-01`, `reading-phonics-01`, `reading-comprehension-01`, `science-plants-01` — none of which are real content) entirely with the 246 generated Phonics entries, keeping the existing header comment block that documents the field format. Note in a short comment above the Phonics block where this batch came from (folder name + date), so future topic batches can follow the same pattern.

### 4. Docs

Update `README.md`'s "Google Drive source folder" section (added last session) to reflect that this folder is now the live source for the Phonics subject rather than just a browsing link, and add a short note on how another topic/subject could be bulk-imported the same way (browse the Drive folder, extract file ids, generate manifest entries) — keeps the door open for the "different topic" extension the user mentioned without over-engineering a config schema for it now.

### 5. Verify end-to-end

- `npx tsc --noEmit`, `npm run lint`, `npm run test` — no code changed, but the manifest is read at startup (`lib/manifest.ts` throws on malformed YAML / duplicate ids), so a clean `npm run dev` startup log (`[startup] Synced 246 lesson(s)...`) is the real check.
- `curl localhost:3000/api/lessons` and confirm `246` lessons, subject `"Phonics"`.
- Open `/library` and `/watch/phonics-001` (or similar) in the browser, screenshot, and confirm the Drive iframe actually renders the video preview (this requires the browser to be logged into a Google account with access to the shared folder — call this out if the preview shows an access-denied state instead of the video).
