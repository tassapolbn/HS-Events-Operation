-- ============================================================
-- Board feeds under new names, and a refresh notice for out-of-date boards.
--
-- Until 27 September the display board downloaded all of its work every 30
-- seconds, and asked for new photo links every hour. A board page opened
-- before then is still running that old code on some screen. Nobody knows
-- which one, and it was most of the project's data use: about 2,800 full
-- downloads of the board a day, plus every photo again each hour.
--
-- A page that is already open cannot be told to reload, but it can be given
-- something to show. So:
--   * public_board_events and public_board_requests are the board feeds from
--     now on. Their output is exactly what public_display_events and
--     public_display_requests returned. The app calls the new names, and
--     falls back to the old ones until this migration has run.
--   * public_display_events and public_display_requests now return a single
--     card each asking for a refresh. Only pages loaded before this release
--     still call them, so the card appears only on screens that need a
--     refresh, and costs almost no data while it waits there. With no photos
--     on it, those screens stop downloading photos too.
--
-- Run after 20261009090000_archive_folder.sql, once the app release that
-- calls public_board_events is live.
-- ============================================================

-- ---------- Board feeds: same output, new names ----------
-- Copied unchanged from 20260919010000_event_contacts.sql
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

-- Copied unchanged from 20261009090000_archive_folder.sql
create or replace function public.public_board_requests(p_campus text default null)
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
      'due_at', r.due_at,
      'created_at', r.created_at,
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
      and r.archived_at is null
      and r.status <> 'cancelled'
      and (r.status <> 'completed' or r.updated_at > now() - interval '7 days')
      and (p_campus is null or r.campus = p_campus)
  ) sub;
$$;

grant execute on function public.public_board_events(text) to anon, authenticated;
grant execute on function public.public_board_requests(text) to anon, authenticated;

-- ---------- Old feeds: one "please refresh" card each ----------
-- Shaped like a real event and a real request with nothing attached, so the
-- old board shows them as ordinary cards. Dated today in Bangkok, because the
-- old board hides events whose day has passed.
create or replace function public.public_display_events(p_campus text default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-8000-00000000f5f5',
    'name', '⚠️ Please press F5 to refresh this board · กรุณากด F5 เพื่อรีเฟรชบอร์ด',
    'category', 'general',
    'campus', coalesce(p_campus, 'HSC'),
    'event_date', (now() at time zone 'Asia/Bangkok')::date,
    'location', '',
    'setup_start', null,
    'venue_ready', null,
    'event_start', null,
    'event_finish', null,
    'breakdown_start', null,
    'breakdown_deadline', null,
    'setup_start_note', '',
    'venue_ready_note', '',
    'event_start_note', '',
    'event_finish_note', '',
    'breakdown_start_note', '',
    'breakdown_deadline_note', '',
    'description', '<p><strong>This board page was opened before an update, so it no longer shows the latest events.</strong> Press F5, or close this page and open the board link again. From then on it keeps itself up to date.</p><p><strong>หน้าบอร์ดนี้เปิดค้างไว้ตั้งแต่ก่อนการอัปเดต จึงไม่แสดงงานล่าสุด</strong> กรุณากด F5 หรือปิดหน้านี้แล้วเปิดลิงก์บอร์ดใหม่ หลังจากนั้นบอร์ดจะอัปเดตเองอัตโนมัติ</p>',
    'additional_notes', '',
    'status', 'active',
    'header_color', '#b91c1c',
    'header_text_color', '#FFFFFF',
    'contacts', '[]'::jsonb,
    'sessions', '[]'::jsonb,
    'attachments', '[]'::jsonb,
    'tasks', '[]'::jsonb
  ));
$$;

create or replace function public.public_display_requests(p_campus text default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-8000-00000000f5f6',
    'department_id', null,
    'campus', coalesce(p_campus, 'HSC'),
    'title', '⚠️ Please press F5 to refresh this board · กรุณากด F5 เพื่อรีเฟรชบอร์ด',
    'reference', '',
    'location', '',
    'request_date', (now() at time zone 'Asia/Bangkok')::date,
    'due_date', null,
    'due_at', null,
    'created_at', now(),
    'setup_datetime', null,
    'teardown_datetime', null,
    'priority', 'urgent',
    'status', 'new',
    'description', '<p><strong>This board page was opened before an update, so it no longer shows the latest requests.</strong> Press F5, or close this page and open the board link again. From then on it keeps itself up to date.</p><p><strong>หน้าบอร์ดนี้เปิดค้างไว้ตั้งแต่ก่อนการอัปเดต จึงไม่แสดงคำขอล่าสุด</strong> กรุณากด F5 หรือปิดหน้านี้แล้วเปิดลิงก์บอร์ดใหม่ หลังจากนั้นบอร์ดจะอัปเดตเองอัตโนมัติ</p>',
    'notes', '',
    'completed_by', '',
    'acknowledged_by', '',
    'acknowledged_at', null,
    'attachments', '[]'::jsonb
  ));
$$;

-- Let the API see the new functions straight away
notify pgrst, 'reload schema';

-- ============================================================
-- Rollback (run only to undo this migration): re-run public_display_events
-- from 20260919010000_event_contacts.sql and public_display_requests from
-- 20261009090000_archive_folder.sql. The app keeps working either way, and
-- falls back to the old names if the new ones are dropped:
--   drop function if exists public.public_board_events(text);
--   drop function if exists public.public_board_requests(text);
-- ============================================================
