-- ============================================================
-- Migration 006: Event sessions
-- An event can be split into sessions (different days, venues
-- or time slots), and each department task can belong to one.
-- Run after 005_display_mode.sql.
-- ============================================================

create table if not exists event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  title text not null default '',
  session_date date not null,
  location text not null default '',
  start_time timestamptz,
  end_time timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table event_tasks add column if not exists session_id uuid references event_sessions (id) on delete set null;

create index if not exists idx_sessions_event on event_sessions (event_id, session_date);
create index if not exists idx_tasks_session on event_tasks (session_id);

drop trigger if exists trg_sessions_updated on event_sessions;
create trigger trg_sessions_updated before update on event_sessions for each row execute function set_updated_at();
drop trigger if exists trg_audit_sessions on event_sessions;
create trigger trg_audit_sessions after insert or update or delete on event_sessions for each row execute function write_audit_log();

alter table event_sessions enable row level security;

drop policy if exists "sessions_select" on event_sessions;
create policy "sessions_select" on event_sessions
  for select to authenticated using (true);
drop policy if exists "sessions_write" on event_sessions;
create policy "sessions_write" on event_sessions
  for all to authenticated using (is_events_team()) with check (is_events_team());

-- ---------- Update the public display function to include sessions ----------
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
