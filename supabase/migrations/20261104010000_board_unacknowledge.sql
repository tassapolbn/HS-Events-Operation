-- ============================================================
-- Display board: take back an acknowledgement.
--
-- A department can press "Acknowledge" on the wrong panel, or on another
-- department's screen. The board now shows an Undo button next to an
-- acknowledgement, which calls this function to clear who acknowledged and
-- when. Nothing else on the job changes.
--
-- Open to the board without sign in, like public_acknowledge_task and
-- public_toggle_task. Clearing the columns is an ordinary update, so the
-- live signal trigger wakes the other open boards as usual.
--
-- Additive and safe to run again. Already applied to the live database on
-- 4 Nov 2026. Run after 20261103090000_calendar_feed_hide_archived_drafts.sql.
-- ============================================================

create or replace function public_unacknowledge_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_tasks
  set acknowledged_by = '',
      acknowledged_at = null
  where id = p_task_id and deleted_at is null;
end;
$$;

grant execute on function public_unacknowledge_task(uuid) to anon, authenticated;

-- ============================================================
-- Rollback (run only to undo this migration):
--   drop function if exists public_unacknowledge_task(uuid);
-- ============================================================
