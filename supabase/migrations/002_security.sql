-- ============================================================
-- Migration 002: Row Level Security + Storage
-- Run after 001_schema.sql
-- ============================================================

-- ---------- Helper functions ----------
create or replace function get_my_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_events_team()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role in ('admin', 'events_team') from profiles where id = auth.uid()), false);
$$;

create or replace function my_department_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select department_id from profiles where id = auth.uid();
$$;

grant execute on function get_my_role() to authenticated;
grant execute on function is_events_team() to authenticated;
grant execute on function my_department_id() to authenticated;

-- ---------- Enable RLS ----------
alter table departments enable row level security;
alter table profiles enable row level security;
alter table events enable row level security;
alter table event_tasks enable row level security;
alter table task_checklist_items enable row level security;
alter table department_requests enable row level security;
alter table attachments enable row level security;
alter table event_templates enable row level security;
alter table notifications enable row level security;
alter table notification_reads enable row level security;
alter table audit_log enable row level security;

-- ---------- departments ----------
create policy "departments_select" on departments
  for select to authenticated using (true);
create policy "departments_admin_write" on departments
  for all to authenticated using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ---------- profiles ----------
create policy "profiles_select" on profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_update" on profiles
  for update to authenticated using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ---------- events ----------
-- Every authenticated user can read events (read-only overview for departments)
create policy "events_select" on events
  for select to authenticated using (true);
create policy "events_insert" on events
  for insert to authenticated with check (is_events_team());
create policy "events_update" on events
  for update to authenticated using (is_events_team()) with check (is_events_team());
create policy "events_delete" on events
  for delete to authenticated using (is_events_team());

-- ---------- event_tasks ----------
create policy "tasks_select" on event_tasks
  for select to authenticated using (true);
create policy "tasks_insert" on event_tasks
  for insert to authenticated with check (is_events_team());
create policy "tasks_update" on event_tasks
  for update to authenticated
  using (is_events_team() or department_id = my_department_id())
  with check (is_events_team() or department_id = my_department_id());
create policy "tasks_delete" on event_tasks
  for delete to authenticated using (is_events_team());

-- ---------- task_checklist_items ----------
create policy "checklist_select" on task_checklist_items
  for select to authenticated using (true);
create policy "checklist_write" on task_checklist_items
  for all to authenticated
  using (
    is_events_team()
    or exists (
      select 1 from event_tasks t
      where t.id = task_id and t.department_id = my_department_id()
    )
  )
  with check (
    is_events_team()
    or exists (
      select 1 from event_tasks t
      where t.id = task_id and t.department_id = my_department_id()
    )
  );

-- ---------- department_requests ----------
create policy "requests_select" on department_requests
  for select to authenticated
  using (is_events_team() or department_id = my_department_id());
create policy "requests_insert" on department_requests
  for insert to authenticated with check (is_events_team());
create policy "requests_update" on department_requests
  for update to authenticated
  using (is_events_team() or department_id = my_department_id())
  with check (is_events_team() or department_id = my_department_id());
create policy "requests_delete" on department_requests
  for delete to authenticated using (is_events_team());

-- ---------- attachments ----------
create policy "attachments_select" on attachments
  for select to authenticated using (true);
create policy "attachments_insert" on attachments
  for insert to authenticated with check (is_events_team());
create policy "attachments_delete" on attachments
  for delete to authenticated using (is_events_team());

-- ---------- event_templates ----------
create policy "templates_all" on event_templates
  for all to authenticated using (is_events_team()) with check (is_events_team());

-- ---------- notifications ----------
create policy "notifications_select" on notifications
  for select to authenticated
  using (is_events_team() or department_id is null or department_id = my_department_id());
create policy "notifications_insert" on notifications
  for insert to authenticated with check (is_events_team());

-- ---------- notification_reads ----------
create policy "notification_reads_select" on notification_reads
  for select to authenticated using (user_id = auth.uid());
create policy "notification_reads_insert" on notification_reads
  for insert to authenticated with check (user_id = auth.uid());

-- ---------- audit_log ----------
create policy "audit_select" on audit_log
  for select to authenticated using (is_events_team());

-- ---------- Storage bucket for attachments ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

create policy "attachments_bucket_read" on storage.objects
  for select to authenticated using (bucket_id = 'attachments');
create policy "attachments_bucket_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'attachments' and is_events_team());
create policy "attachments_bucket_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'attachments' and is_events_team());
