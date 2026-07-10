-- ============================================================
-- Migration 005: Public display mode, event header colors
-- Run AFTER 004_request_statuses.sql
-- ============================================================

-- ---------- Event header colors ----------
alter table events add column if not exists header_color text not null default '#1a3c5e';
alter table events add column if not exists header_text_color text not null default '#FFFFFF';

-- ---------- Department requests start as "new" ----------
update department_requests set status = 'new' where status = 'not_started';
alter table department_requests alter column status set default 'new';

-- ============================================================
-- Public display functions (SECURITY DEFINER).
-- They expose ONLY safe columns (never internal notes) and allow
-- ONLY two write actions: ticking a task and setting a request
-- status. The anon (not signed in) role can execute them.
-- ============================================================

-- ---------- Departments (safe fields, no emails) ----------
create or replace function public_display_departments()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'code', d.code, 'name_en', d.name_en, 'name_th', d.name_th,
    'color', d.color, 'icon', d.icon, 'sort_order', d.sort_order
  ) order by d.sort_order), '[]'::jsonb)
  from departments d;
$$;

-- ---------- Events board: yesterday onwards, not draft/archived ----------
create or replace function public_display_events()
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
      'event_date', ev.event_date,
      'location', ev.location,
      'setup_start', ev.setup_start,
      'venue_ready', ev.venue_ready,
      'event_start', ev.event_start,
      'event_finish', ev.event_finish,
      'breakdown_start', ev.breakdown_start,
      'breakdown_deadline', ev.breakdown_deadline,
      'description', ev.description,
      'additional_notes', ev.additional_notes,
      'status', ev.status,
      'header_color', ev.header_color,
      'header_text_color', ev.header_text_color,
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
          'title', t.title,
          'description', t.description,
          'work_location', t.work_location,
          'setup_location', t.setup_location,
          'assigned_staff', t.assigned_staff,
          'start_time', t.start_time,
          'completion_time', t.completion_time,
          'status', t.status,
          'notes', t.notes,
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
  ) sub;
$$;

-- ---------- Requests board: open items + recently completed ----------
create or replace function public_display_requests()
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
      'title', r.title,
      'reference', r.reference,
      'location', r.location,
      'request_date', r.request_date,
      'due_date', r.due_date,
      'priority', r.priority,
      'status', r.status,
      'description', r.description,
      'notes', r.notes,
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
  ) sub;
$$;

-- ---------- Tick / untick a task from the display board ----------
create or replace function public_toggle_task(p_task_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_tasks
  set status = case when p_done then 'completed'::task_status else 'not_started'::task_status end
  where id = p_task_id and deleted_at is null;
end;
$$;

-- ---------- Set a request status from the display board ----------
create or replace function public_set_request_status(p_request_id uuid, p_status task_status)
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
  set status = p_status
  where id = p_request_id and deleted_at is null;
end;
$$;

grant execute on function public_display_departments() to anon, authenticated;
grant execute on function public_display_events() to anon, authenticated;
grant execute on function public_display_requests() to anon, authenticated;
grant execute on function public_toggle_task(uuid, boolean) to anon, authenticated;
grant execute on function public_set_request_status(uuid, task_status) to anon, authenticated;

-- ---------- Display devices may view attachments (read only) ----------
drop policy if exists "attachments_bucket_read_anon" on storage.objects;
create policy "attachments_bucket_read_anon" on storage.objects
  for select to anon using (bucket_id = 'attachments');
