-- ============================================================
-- Events that run over several days.
--
-- An event had one date, so the calendar showed a three-day event on its
-- first day only. events.end_date now holds the last day (null when the event
-- is on one day). The event form asks for both, the calendar shows the event
-- on every day in between, and the archive and the board count an event as
-- running until its last day.
--
-- public_board_events is the same as in
-- 20261009120000_board_feeds_refresh_notice.sql, except that it returns
-- end_date and keeps an event on the board until its end date has passed.
--
-- Additive and safe to run again. Run after
-- 20261015090000_announcements_contacts_errors_search.sql.
-- ============================================================

alter table public.events add column if not exists end_date date;

comment on column public.events.end_date is
  'Last day of an event that runs over several days. Null means the event is on event_date only.';

-- The last day cannot come before the first
do $check$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_end_date_not_before_start'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_end_date_not_before_start check (end_date is null or end_date >= event_date);
  end if;
end;
$check$;

create or replace function public.public_board_events(p_campus text default null)
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
      'end_date', ev.end_date,
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
      'contacts', coalesce(ev.contacts, '[]'::jsonb),
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'title', s.title, 'session_date', s.session_date,
          'location', s.location, 'start_time', s.start_time, 'end_time', s.end_time,
          'time_note', s.time_note, 'note', s.note, 'sort_order', s.sort_order,
          'floor_plan_attachment_id', s.floor_plan_attachment_id,
          'floor_plan', (select jsonb_build_object('id', a.id, 'file_name', a.file_name,
            'storage_path', a.storage_path, 'mime_type', a.mime_type)
            from attachments a where a.id = s.floor_plan_attachment_id
              and a.entity_type = 'event' and a.entity_id = ev.id)
        ) order by s.session_date, s.sort_order, s.created_at), '[]'::jsonb)
        from event_sessions s where s.event_id = ev.id and s.is_hidden = false
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
          -- Work inside a hidden session comes off the board with it
          and (t.session_id is null or exists (
            select 1 from event_sessions vs
            where vs.id = t.session_id and vs.is_hidden = false
          ))
      )
    ) as ev_json
    from events ev
    where ev.deleted_at is null
      and ev.status not in ('draft', 'archived')
      and (coalesce(ev.end_date, ev.event_date) >= (now() at time zone 'Asia/Bangkok')::date - 1
        or exists (select 1 from event_sessions active where active.event_id = ev.id
          and active.is_hidden = false
          and active.session_date >= (now() at time zone 'Asia/Bangkok')::date - 1))
      and (p_campus is null or ev.campus = p_campus)
  ) sub;
$$;

grant execute on function public.public_board_events(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- Rollback (run only to undo this migration)
--   re-run public_board_events from 20261009120000_board_feeds_refresh_notice.sql, then
--   alter table public.events drop constraint if exists events_end_date_not_before_start;
--   alter table public.events drop column if exists end_date;
-- ============================================================
