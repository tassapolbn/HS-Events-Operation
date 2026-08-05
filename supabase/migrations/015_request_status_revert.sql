-- ============================================================
-- 015: Allow the display board to untick a request back to 'new'
-- ------------------------------------------------------------
-- The board lets staff tap a status (for example "Acknowledged"). Tapping the
-- active status again should clear it, returning the request to 'new'. The
-- 014 version of public_set_request_status rejected 'new', so we widen the
-- allowed set here and clear the sign-off fields when a request is reset.
--
-- This migration is additive and reversible: it only redefines one function
-- (create or replace) and re-grants execute. The rollback block at the bottom
-- restores the 014 behaviour.
-- ============================================================

create or replace function public_set_request_status(p_request_id uuid, p_status task_status, p_name text default '')
returns void
language plpgsql
security definer
as $$
begin
  -- 'new' is permitted so the board can untick a status back to the start.
  if p_status not in ('new', 'acknowledged', 'needs_revision', 'in_progress', 'completed') then
    raise exception 'Status % is not allowed from the display board', p_status;
  end if;
  update department_requests
  set status = p_status,
      completed_by = case
        when p_status = 'completed' then btrim(coalesce(p_name, ''))
        when p_status = 'new' then ''
        else completed_by
      end,
      acknowledged_by = case
        when p_status = 'acknowledged' then btrim(coalesce(p_name, ''))
        when p_status = 'new' then ''
        else acknowledged_by
      end,
      acknowledged_at = case
        when p_status = 'acknowledged' then now()
        when p_status = 'new' then null
        else acknowledged_at
      end
  where id = p_request_id and deleted_at is null;
end;
$$;

grant execute on function public_set_request_status(uuid, task_status, text) to anon, authenticated;

-- ============================================================
-- Rollback (run only to undo this migration): restore the 014 behaviour
-- ------------------------------------------------------------
-- create or replace function public_set_request_status(p_request_id uuid, p_status task_status, p_name text default '')
-- returns void
-- language plpgsql
-- security definer
-- as $$
-- begin
--   if p_status not in ('acknowledged', 'needs_revision', 'in_progress', 'completed') then
--     raise exception 'Status % is not allowed from the display board', p_status;
--   end if;
--   update department_requests
--   set status = p_status,
--       completed_by = case when p_status = 'completed' then btrim(coalesce(p_name, '')) else completed_by end,
--       acknowledged_by = case when p_status = 'acknowledged' then btrim(coalesce(p_name, '')) else acknowledged_by end,
--       acknowledged_at = case when p_status = 'acknowledged' then now() else acknowledged_at end
--   where id = p_request_id and deleted_at is null;
-- end;
-- $$;
-- grant execute on function public_set_request_status(uuid, task_status, text) to anon, authenticated;
-- ============================================================
