-- ============================================================
-- Event Operations Management - HeadStart International School
-- Migration 001: Schema (tables, enums, triggers, audit)
-- Run this first in the Supabase SQL Editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type user_role as enum ('admin', 'events_team', 'department_manager', 'department_staff');
create type priority_level as enum ('low', 'medium', 'high', 'urgent');
create type event_status as enum ('draft', 'scheduled', 'active', 'completed', 'archived');
create type task_status as enum ('not_started', 'in_progress', 'waiting', 'completed', 'cancelled');

-- ---------- Departments ----------
create table departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_th text not null,
  color text not null default '#1a3c5e',
  icon text not null default 'users',
  emails text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Profiles (linked to Supabase Auth) ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role user_role not null default 'department_staff',
  department_id uuid references departments (id) on delete set null,
  preferred_language text not null default 'en',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Events ----------
create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'general',
  event_date date not null,
  location text not null default '',
  setup_start timestamptz,
  venue_ready timestamptz,
  event_start timestamptz,
  event_finish timestamptz,
  breakdown_start timestamptz,
  breakdown_deadline timestamptz,
  description text not null default '',
  additional_notes text not null default '',
  internal_notes text not null default '',
  priority priority_level not null default 'medium',
  status event_status not null default 'draft',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- Department tasks inside an event ----------
create table event_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,
  title text not null,
  description text not null default '',
  instructions text not null default '',
  work_location text not null default '',
  setup_location text not null default '',
  assigned_staff text not null default '',
  start_time timestamptz,
  completion_time timestamptz,
  priority priority_level not null default 'medium',
  status task_status not null default 'not_started',
  notes text not null default '',
  sort_order int not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- Checklist items for a task ----------
create table task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references event_tasks (id) on delete cascade,
  label text not null,
  is_done boolean not null default false,
  done_by uuid references profiles (id) on delete set null,
  done_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- General department requests (not event related) ----------
create table department_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id) on delete cascade,
  title text not null,
  reference text not null default '',
  head_responsible text not null default '',
  location text not null default '',
  request_date date not null default current_date,
  due_date date,
  priority priority_level not null default 'medium',
  status task_status not null default 'not_started',
  description text not null default '',
  notes text not null default '',
  requested_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- Attachments (events, tasks, requests, templates) ----------
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('event', 'event_task', 'request', 'template')),
  entity_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Event templates ----------
create table event_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  data jsonb not null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- In-app notifications ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'event' check (kind in ('event', 'request', 'system')),
  title text not null,
  body text not null default '',
  event_id uuid references events (id) on delete cascade,
  request_id uuid references department_requests (id) on delete cascade,
  department_id uuid references departments (id) on delete cascade,
  email_sent boolean not null default false,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table notification_reads (
  notification_id uuid not null references notifications (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ---------- Audit history ----------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Indexes ----------
create index idx_events_date on events (event_date) where deleted_at is null;
create index idx_events_status on events (status) where deleted_at is null;
create index idx_event_tasks_event on event_tasks (event_id) where deleted_at is null;
create index idx_event_tasks_dept_status on event_tasks (department_id, status) where deleted_at is null;
create index idx_checklist_task on task_checklist_items (task_id);
create index idx_requests_dept_status on department_requests (department_id, status) where deleted_at is null;
create index idx_requests_date on department_requests (request_date) where deleted_at is null;
create index idx_attachments_entity on attachments (entity_type, entity_id);
create index idx_notifications_dept on notifications (department_id, created_at desc);
create index idx_audit_record on audit_log (record_id, created_at desc);
create index idx_audit_created on audit_log (created_at desc);
create index idx_profiles_department on profiles (department_id);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_departments_updated before update on departments for each row execute function set_updated_at();
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger trg_events_updated before update on events for each row execute function set_updated_at();
create trigger trg_event_tasks_updated before update on event_tasks for each row execute function set_updated_at();
create trigger trg_requests_updated before update on department_requests for each row execute function set_updated_at();
create trigger trg_templates_updated before update on event_templates for each row execute function set_updated_at();

-- ---------- Audit trigger ----------
create or replace function write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (table_name, record_id, action, new_data, changed_by)
    values (tg_table_name, new.id, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    insert into audit_log (table_name, record_id, action, old_data, changed_by)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
end;
$$;

create trigger trg_audit_events after insert or update or delete on events for each row execute function write_audit_log();
create trigger trg_audit_event_tasks after insert or update or delete on event_tasks for each row execute function write_audit_log();
create trigger trg_audit_requests after insert or update or delete on department_requests for each row execute function write_audit_log();
create trigger trg_audit_templates after insert or update or delete on event_templates for each row execute function write_audit_log();

-- ---------- Auto-create profile when a user signs up ----------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Prevent non-admins from changing protected profile fields ----------
create or replace function protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editor_role user_role;
begin
  select role into editor_role from profiles where id = auth.uid();
  if editor_role is distinct from 'admin' and auth.uid() is not null then
    new.role = old.role;
    new.department_id = old.department_id;
    new.is_active = old.is_active;
  end if;
  return new;
end;
$$;

create trigger trg_protect_profile before update on profiles for each row execute function protect_profile_fields();
