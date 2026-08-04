-- ============================================================
-- Migration 014: Campus-aware display functions and board writes
-- Redefines the public display functions to accept a campus filter
-- and to expose the new fields (campus, request setup/teardown, and
-- the marked-by / acknowledged-by sign-off). Extends the two write
-- functions to capture a name, and adds an acknowledge action.
-- These functions remain the ONLY write path for an anonymous
-- visitor, and they only ever touch status and the sign-off fields.
-- Reversible. Run after 013_board_signoff.sql.
-- ============================================================

-- Old zero-arg signatures are dropped so the new default-arg versions
-- are unambiguous when called with no arguments.
drop function if exists public_display_events();
drop function if exists public_display_requests();
drop function if exists public_toggle_task(uuid, boolean);
drop function if exists public_set_request_status(uuid, task_status);

-- ---------- Events board, optionally filtered to one campus ----------
create or replace function public_display_events(p_campus text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(ev_json order by ev_json->>'event_date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', ev.id,
      'name', ev.name,
      'category', ev.category,
      'campus', ev.campus,
      'event_date', ev.event_date,
      'location', ev.location,
      'setup_start', ev.setup_start,
      'venue_ready', ev.venue_ready,
      'event_start', ev.event_start,
      'event_finish', ev.event_finish,
      'breakdown_start', ev.breakdown_start,
      'breakdown_deadline', ev.breakdown_deadline,
      'setup_start_note', ev.setup_start_note,
      'venue_ready_note', ev.venue_ready_note,
      'event_start_note', ev.event_start_note,
      'event_finish_note', ev.event_finish_note,
      'breakdown_start_note', ev.breakdown_start_note,
      'breakdown_deadline_note', ev.breakdown_deadline_note,
      'description', ev.description,
      'additional_notes', ev.additional_notes,
      'status', ev.status,
      'header_color', ev.header_color,
      'header_text_color', ev.header_text_color,
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'title', s.title, 'session_date', s.session_date,
          'location', s.location, 'start_time', s.start_time, 'end_time', s.end_time,
          'time_note', s.time_note, 'note', s.note, 'sort_order', s.sort_order
        ) order by s.session_date, s.sort_order, s.created_at), '[]'::jsonb)
        from event_sessions s where s.event_id = ev.id
      ),
      'attachments', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'file_name', a.file_name, 'storage_path', a.storage_path, 'mime_type', a.mime_type
        ) order by a.created_at), '[]'::jsonb)
        from attachments a
        where a.entity_type = 'event' and a.entity_id = ev.id
      ),
      'tasks', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'department_id', t.department_id,
          'session_id', t.session_id,
          'title', t.title,
          'description', t.description,
          'work_location', t.work_location,
          'setup_location', t.setup_location,
          'assigned_staff', t.assigned_staff,
          'start_time', t.start_time,
          'completion_time', t.completion_time,
          'status', t.status,
          'notes', t.notes,
          'completed_by', t.completed_by,
          'acknowledged_by', t.acknowledged_by,
          'acknowledged_at', t.acknowledged_at,
          'attachments', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', a.id, 'file_name', a.file_name, 'storage_path', a.storage_path, 'mime_type', a.mime_type
            ) order by a.created_at), '[]'::jsonb)
            from attachments a
            where a.entity_type = 'event_task' and a.entity_id = t.id
          )
        ) order by t.sort_order, t.created_at), '[]'::jsonb)
        from event_tasks t
        where t.event_id = ev.id and t.deleted_at is null
      )
    ) as ev_json
    from events ev
    where ev.deleted_at is null
      and ev.status not in ('draft', 'archived')
      and ev.event_date >= current_date - 1
      and (p_campus is null or ev.campus = p_campus)
  ) sub;
$$;

-- ---------- Requests board, optionally filtered to one campus ----------
create or replace function public_display_requests(p_campus text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(r_json order by (r_json->>'request_date') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id,
      'department_id', r.department_id,
      'campus', r.campus,
      'title', r.title,
      'reference', r.reference,
      'location', r.location,
      'request_date', r.request_date,
      'due_date', r.due_date,
      'setup_datetime', r.setup_datetime,
      'teardown_datetime', r.teardown_datetime,
      'priority', r.priority,
      'status', r.status,
      'description', r.description,
      'notes', r.notes,
      'completed_by', r.completed_by,
      'acknowledged_by', r.acknowledged_by,
      'acknowledged_at', r.acknowledged_at,
      'attachments', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'file_name', a.file_name, 'storage_path', a.storage_path, 'mime_type', a.mime_type
        ) order by a.created_at), '[]'::jsonb)
        from attachments a
        where a.entity_type = 'request' and a.entity_id = r.id
      )
    ) as r_json
    from department_requests r
    where r.deleted_at is null
      and r.status <> 'cancelled'
      and (r.status <> 'completed' or r.updated_at > now() - interval '7 days')
      and (p_campus is null or r.campus = p_campus)
  ) sub;
$$;

-- ---------- Tick / untick a task, capturing who marked it ----------
create or replace function public_toggle_task(p_task_id uuid, p_done boolean, p_name text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_tasks
  set status = case when p_done then 'completed'::task_status else 'not_started'::task_status end,
      completed_by = case when p_done then btrim(coalesce(p_name, '')) else '' end
  where id = p_task_id and deleted_at is null;
end;
$$;

-- ---------- Acknowledge a task, capturing who acknowledged it ----------
create or replace function public_acknowledge_task(p_task_id uuid, p_name text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_tasks
  set acknowledged_by = btrim(coalesce(p_name, '')),
      acknowledged_at = now()
  where id = p_task_id and deleted_at is null;
end;
$$;

-- ---------- Set a request status, capturing who did it ----------
create or replace function public_set_request_status(p_request_id uuid, p_status task_status, p_name text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('acknowledged', 'needs_revision', 'in_progress', 'completed') then
    raise exception 'Status % is not allowed from the display board', p_status;
  end if;
  update department_requests
  set status = p_status,
      completed_by = case when p_status = 'completed' then btrim(coalesce(p_name, '')) else completed_by end,
      acknowledged_by = case when p_status = 'acknowledged' then btrim(coalesce(p_name, '')) else acknowledged_by end,
      acknowledged_at = case when p_status = 'acknowledged' then now() else acknowledged_at end
  where id = p_request_id and deleted_at is null;
end;
$$;

grant execute on function public_display_events(text) to anon, authenticated;
grant execute on function public_display_requests(text) to anon, authenticated;
grant execute on function public_toggle_task(uuid, boolean, text) to anon, authenticated;
grant execute on function public_acknowledge_task(uuid, text) to anon, authenticated;
grant execute on function public_set_request_status(uuid, task_status, text) to anon, authenticated;

-- ============================================================
-- Rollback (run only to undo this migration)
-- Recreate the pre-014 signatures by re-running the function
-- bodies from 009 (public_display_events) and 005 (the others),
-- then drop the new ones:
--   drop function if exists public_display_events(text);
--   drop function if exists public_display_requests(text);
--   drop function if exists public_toggle_task(uuid, boolean, text);
--   drop function if exists public_acknowledge_task(uuid, text);
--   drop function if exists public_set_request_status(uuid, task_status, text);
-- ============================================================
