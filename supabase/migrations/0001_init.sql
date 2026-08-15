-- Cloud-mode (Supabase) schema for video-school.
-- Mirrors the local sqlite schema/business rules described in CLAUDE.md,
-- but scoped per-account via RLS + auth.uid() instead of being a single
-- shared dataset. See docs/supabase-integration-plan.md section 6 for the
-- full rationale.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

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

-- `user_id` defaults to `auth.uid()` on all three per-account tables, so
-- client inserts don't need to pass it explicitly — RLS `with check` still
-- confirms it can't be spoofed to another account's id.

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- `lessons` is shared-read for any authenticated account (writes only via
-- the service-role client from sync); the three per-account tables are
-- strictly scoped to `auth.uid()`.

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

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
-- `security_invoker = true` so RLS is evaluated as the querying account,
-- not the view's definer — do not omit this.

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

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------
-- Enroll/unenroll functions (RPC, so both writes happen atomically —
-- supabase-js has no multi-statement client transaction).

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

-- `upsert_watch_progress` (status monotonicity + 5-minute session-gap
-- stitching), scoped by `auth.uid()` internally rather than a passed-in id.

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

-- `get_history_summary`, scoped to `auth.uid()`.

create function get_history_summary() returns table (
  completed_count bigint, distinct_lessons_touched bigint, watch_time_this_week_seconds double precision
) language sql security invoker as $$
  select
    (select count(*) from watch_progress where user_id = auth.uid() and status = 'completed'),
    (select count(*) from watch_progress where user_id = auth.uid() and status != 'not_started'),
    (select coalesce(sum(extract(epoch from (ended_at - started_at))), 0) from watch_events
      where user_id = auth.uid() and started_at >= now() - interval '7 days');
$$;
