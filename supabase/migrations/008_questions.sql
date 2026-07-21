-- ============================================================
-- Migration 008: Ask a question from the display board
-- Department staff read the board without an account, so the
-- question is submitted through a security definer function
-- rather than a direct insert. Submitting also raises a
-- notification that the events team sees when they sign in.
-- Run after 007_timing_notes.sql.
-- ============================================================

create table if not exists event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  department_id uuid references departments (id) on delete set null,
  question text not null,
  status text not null default 'new' check (status in ('new', 'answered')),
  answer text not null default '',
  answered_by uuid references profiles (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_questions_event on event_questions (event_id, created_at desc);
create index if not exists idx_questions_status on event_questions (status, created_at desc);

alter table event_questions enable row level security;

-- Signed in staff can read questions; only the events team can answer them.
drop policy if exists "questions_select" on event_questions;
create policy "questions_select" on event_questions
  for select to authenticated using (true);

drop policy if exists "questions_write" on event_questions;
create policy "questions_write" on event_questions
  for all to authenticated using (is_events_team()) with check (is_events_team());

-- Allow a question notification alongside the existing kinds
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications
  add constraint notifications_kind_check
  check (kind in ('event', 'request', 'system', 'question'));

-- ---------- Submit a question from the public display board ----------
create or replace function public_ask_question(
  p_event_id uuid,
  p_department_id uuid,
  p_question text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question text := btrim(coalesce(p_question, ''));
  v_event_name text;
  v_dept_name text;
begin
  if v_question = '' then
    raise exception 'Question must not be empty';
  end if;

  -- The board is public, so keep a sane upper bound on stored text
  if length(v_question) > 1000 then
    v_question := left(v_question, 1000);
  end if;

  -- Only accept questions for events that are actually on the board
  if not exists (
    select 1 from events
    where id = p_event_id
      and deleted_at is null
      and status not in ('draft', 'archived')
  ) then
    raise exception 'Event is not available';
  end if;

  insert into event_questions (event_id, department_id, question)
  values (p_event_id, p_department_id, v_question);

  select name into v_event_name from events where id = p_event_id;
  select name_en into v_dept_name from departments where id = p_department_id;

  insert into notifications (kind, title, body, event_id, department_id)
  values (
    'question',
    coalesce(v_dept_name, 'A department') || ' asked a question',
    coalesce(v_event_name, 'Event') || ': ' || v_question,
    p_event_id,
    p_department_id
  );
end;
$$;

grant execute on function public_ask_question(uuid, uuid, text) to anon, authenticated;
