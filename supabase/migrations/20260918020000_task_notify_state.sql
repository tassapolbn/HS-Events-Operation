-- ============================================================
-- Remember which work has already been emailed to a department.
--
-- Sessions get added to over several days, so the events team needs to see at
-- a glance which jobs in a session the departments have not been told about
-- yet. A task carries the time it was last successfully emailed; anything with
-- no time on it is work nobody has been sent.
--
-- Only the send-notification Edge Function writes this column, with the service
-- role, so no policy change is needed. Additive and reversible.
-- Run after 20260916143212_support_board_schedule.sql.
-- ============================================================

alter table public.event_tasks add column if not exists notified_at timestamptz;

comment on column public.event_tasks.notified_at is
  'When this task was last successfully emailed to its department. Null means it has never been sent.';

-- Finding the unsent work of one session is the query the session bell runs
create index if not exists event_tasks_unnotified_idx
  on public.event_tasks (event_id, session_id)
  where notified_at is null and deleted_at is null;

-- ============================================================
-- Rollback (run only to undo this migration)
--   drop index if exists event_tasks_unnotified_idx;
--   alter table public.event_tasks drop column if exists notified_at;
-- ============================================================
