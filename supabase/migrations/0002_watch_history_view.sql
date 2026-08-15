-- Adds the watch_history view needed by lib/lessons/supabase.ts's
-- getHistory() (task 11). Not part of 0001_init.sql because that migration
-- may already be applied elsewhere by the time this was written — see
-- docs/supabase-integration-tasks/11-supabase-lessons-impl.md step 11.
--
-- 3-way join of watch_events + lessons + watch_progress, mirroring
-- lib/lessons/sqlite.ts's getHistory query. `security_invoker = true` so RLS
-- is evaluated as the querying account (same convention as the two views in
-- 0001_init.sql) — the view itself carries no explicit user_id filter
-- because RLS on watch_events ("own rows only") already restricts e to the
-- current account; the left join to watch_progress is additionally
-- constrained to the same user_id both for correctness (in case a lesson_id
-- somehow had rows from multiple accounts visible some other way) and to
-- avoid depending solely on watch_progress's own RLS for that join's shape.

create view watch_history with (security_invoker = true) as
select
  e.id as event_id,
  e.lesson_id,
  l.title,
  l.subject,
  e.source,
  e.started_at,
  e.ended_at,
  p.position_seconds,
  p.duration_seconds
from watch_events e
join lessons l on l.id = e.lesson_id
left join watch_progress p on p.lesson_id = e.lesson_id and p.user_id = e.user_id
where l.archived = false;
