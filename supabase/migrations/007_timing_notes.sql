-- ============================================================
-- Migration 007: Flexible timing notes
-- Each milestone can carry an optional free text note for timings
-- that are not a clock time, for example "after school time" or
-- "anytime on that day". The display board shows the note next to
-- the time, or on its own when no time is set.
-- Run after 006_sessions.sql.
-- ============================================================

alter table events
  add column if not exists setup_start_note text not null default '',
  add column if not exists venue_ready_note text not null default '',
  add column if not exists event_start_note text not null default '',
  add column if not exists event_finish_note text not null default '',
  add column if not exists breakdown_start_note text not null default '',
  add column if not exists breakdown_deadline_note text not null default '';

-- ---------- Return the timing notes from the public display function ----------
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
          'sort_order', s.sort_order
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
