-- ============================================================
-- Who to ask about an event.
--
-- A department reading the board sees what to do but not who decided it, so a
-- question about a job turns into a hunt for whoever set the event up. An event
-- now carries the people to ask: none, one, or several, each with a name and
-- whatever way of reaching them is useful.
--
-- Held as jsonb rather than its own table because this is a short list that is
-- always read with its event, never queried on its own, and the display board
-- fetches an event in a single call.
--
-- Additive and reversible. Run after 20260918060000_username_login.sql.
-- ============================================================

alter table public.events add column if not exists contacts jsonb not null default '[]'::jsonb;

comment on column public.events.contacts is
  'People to ask about this event: [{name, role, phone, email}]. Only name is required.';

-- A shape the app can rely on: an array, at most eight, each one an object with
-- a name that is not blank.
--
-- The test reads every entry, and a check constraint is not allowed to contain
-- a subquery, so it lives in a function the constraint calls instead. Immutable
-- because the answer depends on nothing but the value handed to it, which is
-- what a constraint is allowed to rely on.
create or replace function public.events_contacts_ok(p_contacts jsonb)
returns boolean
language sql
immutable
as $fn$
  select jsonb_typeof(p_contacts) = 'array'
     and jsonb_array_length(p_contacts) <= 8
     and not exists (
       select 1
       from jsonb_array_elements(p_contacts) as entry
       where jsonb_typeof(entry.value) <> 'object'
          or coalesce(btrim(entry.value ->> 'name'), '') = ''
     );
$fn$;

comment on function public.events_contacts_ok(jsonb) is
  'True when a contacts value is an array of at most eight named people.';

alter table public.events drop constraint if exists events_contacts_shape;
alter table public.events add constraint events_contacts_shape
  check (public.events_contacts_ok(contacts));

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
      and (ev.event_date >= (now() at time zone 'Asia/Bangkok')::date - 1
        or exists (select 1 from event_sessions active where active.event_id = ev.id
          and active.is_hidden = false
          and active.session_date >= (now() at time zone 'Asia/Bangkok')::date - 1))
      and (p_campus is null or ev.campus = p_campus)
  ) sub;
$$;

grant execute on function public_display_events(text) to anon, authenticated;

-- ============================================================
-- Rollback (run only to undo this migration)
--   alter table public.events drop constraint if exists events_contacts_shape;
--   drop function if exists public.events_contacts_ok(jsonb);
--   alter table public.events drop column if exists contacts;
--   then re-run public_display_events from 20260914030000_session_visibility.sql
-- ============================================================
