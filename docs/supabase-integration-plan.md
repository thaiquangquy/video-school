# Integrate Supabase as a second deployable mode (dual-backend: local SQLite / cloud Supabase, with per-account enrollment in cloud mode)

## Context

This app was built as local-only, no-auth, LAN-only (per `CLAUDE.md`): SQLite via `better-sqlite3` holds `lessons`/`watch_progress`/`watch_events`, and every page/API route calls `lib/lessons.ts` directly with no session concept anywhere.

Through discussion, the requirement settled on is **two deployable modes, selected by one env var**, with meaningfully different feature sets — not just a backend swap:

- **local mode** (`DATA_BACKEND=sqlite`, default) — today's exact persistence and catalog behavior, unchanged: every lesson in `data/lessons.yaml` is visible and tracked for everyone. New: a login gate for UX-flow parity with cloud mode, backed by a single shared password — no Supabase, no external service, no new dependency, no per-account concept.
- **cloud mode** (`DATA_BACKEND=supabase`) — persistence moves to Supabase Postgres, auth moves to Supabase Auth with **multiple individual accounts** (e.g. each parent has their own login, created manually in the dashboard — no self-service signup), and the app becomes remotely accessible. Unlike local mode, **each account has its own enrollment and progress**: the lesson catalog itself is shared (still sourced from `data/lessons.yaml`), but a lesson only shows up and starts tracking progress for an account once that account explicitly enrolls in it. Un-enrolling stops it appearing in "my lessons" but preserves that account's history (same "never destroy history" philosophy the app already uses for archived lessons and resets).

This means cloud mode isn't just "swap the database" — it adds a real new feature (browse catalog → enroll → track progress) that local mode does not have and does not need. The two modes' UI diverges slightly as a result (Library page gets an enroll affordance in cloud mode only), which pages/components handle by checking a `SUPPORTS_ENROLLMENT` flag derived from `DATA_BACKEND`, not by duplicating pages.

`data/lessons.yaml` remains the source of truth for lesson *content* (title/subject/tags/local path/drive URL/order) in both modes — `lib/sync.ts` reconciles it into the shared `lessons` catalog table on every server start, in whichever backend is active. It never seeds per-account rows in cloud mode (enrollment does that instead — see below). The video-file watcher/matcher (`lib/watcher.ts`, `lib/videoMatch.ts`) and range-request streaming (`lib/rangeRequest.ts`) are unaffected in their file-handling logic in either mode.

Next.js 16 renames `middleware.ts` to `proxy.ts` (confirmed in `node_modules/next/dist/docs`) — the auth gate uses that new convention.

**Known tradeoff, stated up front**: business rules that touch the DB — status monotonicity in `upsertProgress`, the 5-minute session-gap stitching into `watch_events`, non-monotonic `markStatus` — are implemented twice: once in TS against `better-sqlite3` (local mode, single shared dataset), once in SQL/plpgsql against Postgres (cloud mode, per-account via RLS + `auth.uid()`). There's no single source of truth for this logic across backends; both must be kept in sync by hand whenever one changes.

## High-level architecture

```
lib/backend.ts          # reads/validates DATA_BACKEND; exports BACKEND and SUPPORTS_ENROLLMENT
lib/lessons/
  types.ts              # shared types
  sqlite.ts              # today's lib/lessons.ts logic, moved, wrapped async;
                          #   getEnrolledLessons === getAllLessons, getCatalog returns
                          #   all lessons with isEnrolled: true, enroll/unenroll are no-ops
                          #   (graceful degradation so callers never branch on backend)
  supabase.ts             # new Supabase-backed implementation, real enrollment semantics
  index.ts               # dispatches by lib/backend.ts, re-exports same names
lib/sync/
  sqlite.ts, supabase.ts, index.ts   # same dispatch pattern; supabase.ts only ever
                                       # touches the shared `lessons` table, never per-account data
lib/auth/
  local.ts               # password + signed-cookie session
  supabase.ts             # Supabase Auth session
  index.ts               # dispatches by lib/backend.ts
```

`@/lib/lessons`, `@/lib/sync`, `@/lib/auth` are the only import paths other modules use. Pages/components branch on `SUPPORTS_ENROLLMENT` only for *UI* decisions (show the enroll button or not) — the data functions themselves are always safely callable in both modes.

## 1. Mode selection

`lib/backend.ts`:
```ts
const raw = process.env.DATA_BACKEND ?? "sqlite";
if (raw !== "sqlite" && raw !== "supabase") {
  throw new Error(`Invalid DATA_BACKEND "${raw}" — must be "sqlite" or "supabase"`);
}
export const BACKEND = raw;
export const SUPPORTS_ENROLLMENT = BACKEND === "supabase";
```
Read once at module load; throws at startup on an unrecognized value.

## 2. Packages

- Add (only exercised when `DATA_BACKEND=supabase`): `@supabase/supabase-js`, `@supabase/ssr`.
- Keep, unchanged: `better-sqlite3`, `@types/better-sqlite3`, `chokidar`, `js-yaml`.
- No new dependency for local auth — cookie signing uses Node's built-in `crypto` (`createHmac`).

## 3. Environment variables

- Local mode: `APP_PASSWORD` (shared household password), `SESSION_SECRET` (random string, HMAC-signs the session cookie).
- Cloud mode: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, session-bound SSR client, subject to RLS), `SUPABASE_SERVICE_ROLE_KEY` (server-only — used exclusively by `lib/sync/supabase.ts` and `lib/watcher.ts`'s startup writes to the shared `lessons` table, which run outside any user session).
- `.env.example` documents all five, grouped by mode.

## 4. Data layer

`lib/lessons/sqlite.ts` — today's logic, moved as-is, each export wrapped `async`. New exports added purely for interface symmetry with the Supabase path, all trivial:
- `getEnrolledLessons()` → same as `getAllLessons()`.
- `getCatalog()` → same rows, each with `isEnrolled: true`.
- `enroll(lessonId)` / `unenroll(lessonId)` → no-ops (resolve immediately; nothing to do when every lesson is always visible to the one shared login).

`lib/lessons/supabase.ts` — new implementation with real enrollment semantics:
- `getCatalog()` → queries a `catalog_with_enrollment` view (all non-archived lessons + a computed `isEnrolled` boolean for the current account).
- `getEnrolledLessons()` / `getLessonById(id)` → queries a `my_enrolled_lessons_with_progress` view (join of `lessons` + `enrollments` + `watch_progress`, scoped to the current account) — a lesson the account hasn't enrolled in simply isn't in this result set.
- `enroll(lessonId)` → `.rpc('enroll_in_lesson', {p_lesson_id})`.
- `unenroll(lessonId)` → `.rpc('unenroll_from_lesson', {p_lesson_id})` — removes the `enrollments` row only; `watch_progress`/`watch_events` history is preserved, matching the app's existing archive-don't-delete philosophy.
- `upsertProgress` → `.rpc('upsert_watch_progress', {...})` (no `user_id` param needed — the function reads `auth.uid()` itself).
- `markStatus`, `resetProgress` → plain `.upsert()`/`.update()` against `watch_progress`, RLS-scoped; `markStatus` stays explicitly non-monotonic, matching the SQLite path exactly.
- `getContinueLearning`, `getHistory`, `getHistorySummary` → query the per-account views/RPCs; no explicit `user_id` filters needed in the JS since RLS enforces per-account scoping server-side regardless of what the query asks for — a real defense-in-depth property (a query that "forgot" to filter still can't see another account's rows).

`lib/lessons/index.ts` re-exports whichever implementation is active by `BACKEND`, unchanged shape either way.

## 5. `lib/sync/` and `lib/watcher.ts`

- `lib/sync/sqlite.ts` — today's `syncLessonsFromManifest`, unchanged (still pre-seeds a default `watch_progress` row per lesson, since local mode has one shared dataset).
- `lib/sync/supabase.ts` — reconciles `data/lessons.yaml` into the shared `lessons` table only (admin/service-role client): fetch existing rows, diff against the manifest in memory (preserve `auto_matched` `local_path`, soft-archive rows removed from the manifest), batch `.upsert()`/`.update()`. **Does not** touch `watch_progress`/`enrollments`/`watch_events` — those are created lazily per account via `enroll()`, not pre-seeded at sync time, since sync runs with no per-account context.
- `lib/watcher.ts` — direct `db.prepare(...)` calls replaced with dispatched helpers (`getUnmatchedLessons()`, `setLocalPath()`, `clearLocalPath()`) added to `lib/lessons/index.ts`'s surface, all operating on the shared `lessons` table only (backend-agnostic from `watcher.ts`'s point of view). Chokidar file-watching (`fs`) logic is untouched.
- `instrumentation.ts` — calls `initSchema()` only when `BACKEND === "sqlite"`; `syncLessonsFromManifest()` and `startVideoWatcher()` run unconditionally, both awaited.

## 6. Supabase-mode schema (only relevant when `DATA_BACKEND=supabase`)

New file `supabase/migrations/0001_init.sql`.

```sql
create table lessons (
  id text primary key,
  title text not null,
  subject text not null,
  tags jsonb not null default '[]',
  local_path text,
  local_path_source text check (local_path_source in ('manifest', 'auto_matched')),
  drive_url text,
  order_index integer not null default 0,
  duration_seconds double precision,
  archived boolean not null default false
);

create table enrollments (
  user_id uuid not null default auth.uid() references auth.users(id),
  lesson_id text not null references lessons(id),
  enrolled_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table watch_progress (
  user_id uuid not null default auth.uid() references auth.users(id),
  lesson_id text not null references lessons(id),
  position_seconds double precision not null default 0,
  duration_seconds double precision,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  last_watched_at timestamptz,
  source_last_played text check (source_last_played in ('local', 'drive')),
  updated_seq bigint generated always as identity,
  primary key (user_id, lesson_id)
);

create table watch_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  lesson_id text not null references lessons(id),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  source text not null check (source in ('local', 'drive'))
);

create index idx_watch_events_user_lesson on watch_events(user_id, lesson_id);
create index idx_watch_events_started on watch_events(started_at);
create index idx_watch_progress_user_status on watch_progress(user_id, status);
```

`user_id` defaults to `auth.uid()` on all three per-account tables, so client inserts don't need to pass it explicitly — RLS `with check` still confirms it can't be spoofed to another account's id.

RLS — `lessons` is shared-read for any authenticated account (writes only via the service-role client from sync); the three per-account tables are strictly scoped to `auth.uid()`:

```sql
alter table lessons enable row level security;
alter table enrollments enable row level security;
alter table watch_progress enable row level security;
alter table watch_events enable row level security;

create policy "authenticated read" on lessons for select using (auth.role() = 'authenticated');

create policy "own rows only" on enrollments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows only" on watch_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows only" on watch_events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Views — `security_invoker = true` so RLS is evaluated as the querying account, not the view's definer:

```sql
create view catalog_with_enrollment with (security_invoker = true) as
select l.*, (e.user_id is not null) as is_enrolled
from lessons l
left join enrollments e on e.lesson_id = l.id and e.user_id = auth.uid()
where l.archived = false;

create view my_enrolled_lessons_with_progress with (security_invoker = true) as
select l.*, e.enrolled_at,
       p.position_seconds, p.duration_seconds as progress_duration_seconds,
       p.status, p.last_watched_at, p.source_last_played, p.updated_seq
from lessons l
join enrollments e on e.lesson_id = l.id and e.user_id = auth.uid()
left join watch_progress p on p.lesson_id = l.id and p.user_id = auth.uid()
where l.archived = false;
```

Enroll/unenroll functions (RPC, so both writes happen atomically — `supabase-js` has no multi-statement client transaction):

```sql
create function enroll_in_lesson(p_lesson_id text) returns void
language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into enrollments (lesson_id) values (p_lesson_id) on conflict do nothing;
  insert into watch_progress (lesson_id) values (p_lesson_id) on conflict do nothing;
end;
$$;

create function unenroll_from_lesson(p_lesson_id text) returns void
language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from enrollments where user_id = auth.uid() and lesson_id = p_lesson_id;
  -- watch_progress/watch_events intentionally left in place: history survives un-enrolling,
  -- same as archived lessons and resets already do elsewhere in this app.
end;
$$;
```

`upsert_watch_progress` (status monotonicity + 5-minute session-gap stitching), scoped by `auth.uid()` internally rather than a passed-in id:

```sql
create function upsert_watch_progress(
  p_lesson_id text, p_position_seconds double precision,
  p_duration_seconds double precision, p_source text, p_now timestamptz
) returns void language plpgsql security invoker as $$
declare
  v_status text;
  v_last_event_ended timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select status into v_status from watch_progress where user_id = auth.uid() and lesson_id = p_lesson_id;
  if v_status = 'completed' then
    v_status := 'completed';  -- monotonic: never downgrade an already-completed lesson
  elsif p_duration_seconds is not null and p_position_seconds >= p_duration_seconds * 0.95 then
    v_status := 'completed';
  else
    v_status := 'in_progress';
  end if;

  insert into watch_progress (lesson_id, position_seconds, duration_seconds, status, last_watched_at, source_last_played)
  values (p_lesson_id, p_position_seconds, p_duration_seconds, v_status, p_now, p_source)
  on conflict (user_id, lesson_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    status = excluded.status,
    last_watched_at = excluded.last_watched_at,
    source_last_played = excluded.source_last_played;

  select ended_at into v_last_event_ended from watch_events
    where user_id = auth.uid() and lesson_id = p_lesson_id order by ended_at desc limit 1;

  if v_last_event_ended is not null and p_now - v_last_event_ended <= interval '5 minutes' then
    update watch_events set ended_at = p_now
      where user_id = auth.uid() and lesson_id = p_lesson_id and ended_at = v_last_event_ended;
  else
    insert into watch_events (lesson_id, started_at, ended_at, source) values (p_lesson_id, p_now, p_now, p_source);
  end if;
end;
$$;
```

`get_history_summary`, scoped to `auth.uid()`:

```sql
create function get_history_summary() returns table (
  completed_count bigint, distinct_lessons_touched bigint, watch_time_this_week_seconds double precision
) language sql security invoker as $$
  select
    (select count(*) from watch_progress where user_id = auth.uid() and status = 'completed'),
    (select count(*) from watch_progress where user_id = auth.uid() and status != 'not_started'),
    (select coalesce(sum(extract(epoch from (ended_at - started_at))), 0) from watch_events
      where user_id = auth.uid() and started_at >= now() - interval '7 days');
$$;
```

## 7. Auth

- `lib/auth/local.ts` — Server Action checks the submitted password against `APP_PASSWORD`, sets an httpOnly cookie with `{exp}` + HMAC-SHA256 signature (`SESSION_SECRET`). `getSession()` verifies signature + expiry. No accounts, no email field.
- `lib/auth/supabase.ts` — `signIn`/`signOut` Server Actions via `@supabase/ssr`'s cookie-writable server client (`signInWithPassword`/`signOut`); `getSession()` via `supabase.auth.getUser()`. Any number of accounts, created manually in the Supabase dashboard.
- `lib/auth/index.ts` — dispatches by `BACKEND`.
- `app/login/page.tsx` — local mode: password-only form. Cloud mode: email + password.
- `proxy.ts` (Next 16 naming, not `middleware.ts`) — dispatched session check/refresh, redirects to `/login` if absent. Matcher excludes `/login`, static assets, `/api/health`. Real enforcement in cloud mode is Postgres RLS via the session-bound client; in local mode it's the HMAC check itself.

## 8. Pages & API routes

- `app/library/page.tsx` — the one page whose behavior meaningfully differs by mode. Always calls `getEnrolledLessons()` for the main grid (works in both modes — in local mode this is just "all lessons," in cloud mode it's "my enrolled lessons"). When `SUPPORTS_ENROLLMENT` is true, also renders a "Browse all lessons" section from `getCatalog()` with Enroll/Unenroll buttons per lesson (posting to a new API route below); this section doesn't render at all in local mode.
- `app/page.tsx` (Home), `app/history/page.tsx` — unchanged code, since `getContinueLearning`/`getHistory`/`getHistorySummary` are already correctly scoped per mode by the dispatch layer (no per-page branching needed).
- `app/watch/[id]/page.tsx` — calls `getLessonById(id)`, which in cloud mode only returns a result if the current account is enrolled (via the `my_enrolled_lessons_with_progress` view) — a lesson that exists in the catalog but isn't enrolled behaves like "not found," same `notFound()` path already used for a truly missing id. No special-casing needed in the page itself.
- New API routes: `app/api/lessons/[id]/enroll/route.ts` (`POST`) and `app/api/lessons/[id]/unenroll/route.ts` (`POST` or `DELETE`), calling `lib/lessons`'s `enroll`/`unenroll` (no-ops in local mode, so these routes are harmless — but the Library page only calls them when `SUPPORTS_ENROLLMENT` is true, so they're effectively unreachable in local mode's UI).
- Every existing route/page call site needs `await` added now that every implementation (including the SQLite wrapper) is async. `VideoPlayer.tsx`'s heartbeat needs no change in either mode — same-origin, session cookie rides along automatically.

## 9. Testing

- SQLite-path tests: today's `tests/lessons.test.ts` continues working essentially unchanged (in-memory `better-sqlite3`, `DATA_BACKEND` defaults to `sqlite`) — remains the fast default suite. Add a couple of new cases for the graceful-degradation stubs (`getCatalog` returns `isEnrolled: true` for everything, `enroll`/`unenroll` are no-ops).
- Supabase-path tests: a parallel suite (e.g. `tests/lessons.supabase.test.ts`), run opt-in against `npx supabase start`'s local Postgres, truncating tables between tests. Must cover the enrollment-specific behavior this mode adds: a lesson not yet enrolled doesn't appear in `getEnrolledLessons`/`getLessonById`; enrolling seeds a `not_started` progress row; un-enrolling removes it from the enrolled list but preserves `watch_progress`/`watch_events`; and — the most important new correctness property — **cross-account isolation**: two accounts enrolled in the same lesson each get independent progress, and neither can see or affect the other's rows (test this by creating two Supabase Auth test users and asserting one's session never returns the other's data).

## 10. Docker / deployment

- Same image; `DATA_BACKEND`, `APP_PASSWORD`/`SESSION_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` are pure runtime env vars (`docker run -e ...`, no rebuild). `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` get inlined into the JS bundle by `next build`, so a cloud-mode deployment needs its own image build with those as `ARG`/`ENV` in the Dockerfile's `builder` stage — it can't reuse a local-mode image and flip an env var at `docker run` time.
- Local mode: `docker run ... -e DATA_BACKEND=sqlite -e APP_PASSWORD=... -e SESSION_SECRET=... -v "$(pwd)/data:/app/data" video-school`.
- Cloud mode: build with the `NEXT_PUBLIC_*` build args, then `docker run ... -e DATA_BACKEND=supabase -e SUPABASE_SERVICE_ROLE_KEY=... -v "$(pwd)/data:/app/data" video-school` (volume still needed for `data/lessons.yaml`/`data/videos/`, not for a sqlite db in this mode). No self-hosted Supabase Docker stack — cloud mode always points at a real Supabase Cloud project.
- `CLAUDE.md`'s Docker section will need updating once this lands — flagged for the user, not built as part of this plan unless they want the doc updated too.

## Out of scope

- Self-service signup for cloud-mode accounts (created manually in the Supabase dashboard).
- Migrating existing `data/app.db` history into Supabase if a deployment later switches from local to cloud mode.
- Reverse proxy/TLS/public hostname for actually exposing cloud mode to the internet.
- Self-hosted Supabase (Postgres+Auth+PostgREST via Docker) as a third mode.
- Anything beyond a flat enroll/unenroll toggle — no prerequisites, capacity limits, or admin-assigns-lessons-to-accounts workflow; any account can enroll in any catalog lesson at will.

## Verification

1. Local mode: `DATA_BACKEND=sqlite npm run dev` → login gate with password-only form; all lessons visible to everyone as today; no enroll UI anywhere.
2. Cloud mode: `npx supabase start`, apply the migration, `DATA_BACKEND=supabase npm run dev` pointed at the local instance → email+password login, create two accounts in the dashboard.
3. Enrollment flow: from account A, browse the catalog, enroll in a lesson, confirm it now appears in "my lessons" with `not_started` progress; watch it, confirm progress updates; un-enroll, confirm it drops out of "my lessons" but re-enrolling shows the same progress/history as before (not reset).
4. **Cross-account isolation**: from account B, confirm the lesson account A enrolled in and watched does not show as enrolled/in-progress for B; enroll B in the same lesson and confirm B's progress starts fresh at `not_started` independent of A's.
5. Business-rule parity in both backends: rewind after `completed` stays `completed`; `markStatus`/`resetProgress` move status freely; a heartbeat within 5 minutes of the last one extends the same `watch_events` row.
6. `npm run test` (default SQLite suite) and the opt-in Supabase suite both pass; `npx tsc --noEmit`, `npm run lint` clean.
7. Docker: build+run local mode (confirm `APP_PASSWORD` changes without a rebuild) and cloud mode (confirm `NEXT_PUBLIC_SUPABASE_URL` requires a rebuild) — both serve correctly end to end, including local video streaming and the enroll flow in cloud mode.

## Task breakdown

Implementation is split into 20 tasks across six phases, one markdown file per task, under `docs/supabase-integration-tasks/`. Each task file is self-contained (goal, files, detailed steps, acceptance test, dependencies) so it can be handed to a subagent independently. See `docs/supabase-integration-tasks/00-index.md` for the full list and dependency graph.
