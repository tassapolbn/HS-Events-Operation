-- ============================================================
-- Live display board: reload only when something changes.
--
-- The public board used to ask for every event and every request every 30
-- seconds, day and night, and renewed every photo link every 45 minutes. That
-- alone was using more than the whole free plan data allowance.
--
-- Now each campus has a small "signal" row per board (events, requests). A
-- trigger raises its version whenever anything that board shows is added,
-- edited, deleted, ticked or given a file. Open boards listen to these rows
-- over Supabase Realtime and reload only when their own version moves, so an
-- idle board costs almost nothing.
--
-- The board only ever receives "campus HSC, events board, version 42". None
-- of the event, task or request data travels over Realtime.
--
-- A change touching many rows at once (a pasted block of tasks, an imported
-- session) raises each version once per transaction, not once per row.
--
-- Additive and safe to run again. Already applied to the live database on
-- 27 Sep 2026. Run after 20260919010000_event_contacts.sql.
-- ============================================================

create table if not exists public.display_signals (
  campus     text        not null check (campus in ('HSC', 'HSN')),
  board      text        not null check (board in ('events', 'requests')),
  version    bigint      not null default 0,
  changed_at timestamptz not null default now(),
  primary key (campus, board)
);

comment on table public.display_signals is
  'One row per campus and board. The version rises whenever something the public display board shows changes. Open boards listen over Realtime and reload only then.';

insert into public.display_signals (campus, board)
values ('HSC', 'events'), ('HSC', 'requests'), ('HSN', 'events'), ('HSN', 'requests')
on conflict (campus, board) do nothing;

-- Anyone may read a version number: it says nothing about the work itself.
-- Only the trigger below writes here.
alter table public.display_signals enable row level security;

drop policy if exists display_signals_read on public.display_signals;
create policy display_signals_read on public.display_signals
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate, references, trigger on public.display_signals from anon, authenticated;
grant select on public.display_signals to anon, authenticated;

-- Works out which campus and board a changed row belongs to and raises that
-- signal. Old and new rows are both checked, so moving an event from one
-- campus to the other wakes both boards.
create or replace function public.display_signal_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_old    jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new    jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row    jsonb;
  v_board  text;
  v_campus text;
  v_flag   text;
begin
  -- An update that changes nothing leaves the boards alone
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  foreach v_row in array array_remove(array[v_old, v_new], null) loop
    v_campus := null;
    v_board := case
      when tg_table_name = 'department_requests' then 'requests'
      when tg_table_name = 'attachments' and v_row ->> 'entity_type' = 'request' then 'requests'
      else 'events'
    end;

    if tg_table_name in ('events', 'department_requests') then
      v_campus := v_row ->> 'campus';
    elsif tg_table_name in ('event_sessions', 'event_tasks') then
      select e.campus into v_campus
      from events e
      where e.id = (v_row ->> 'event_id')::uuid;
    elsif tg_table_name = 'attachments' then
      if v_row ->> 'entity_type' = 'event' then
        select e.campus into v_campus
        from events e
        where e.id = (v_row ->> 'entity_id')::uuid;
      elsif v_row ->> 'entity_type' = 'event_task' then
        select e.campus into v_campus
        from event_tasks t
        join events e on e.id = t.event_id
        where t.id = (v_row ->> 'entity_id')::uuid;
      elsif v_row ->> 'entity_type' = 'request' then
        select r.campus into v_campus
        from department_requests r
        where r.id = (v_row ->> 'entity_id')::uuid;
      end if;
      -- Template files never reach the board, so they raise nothing
    end if;

    continue when v_campus is null;

    -- Once per campus and board per transaction is enough: the board reloads
    -- after the commit and sees every row the transaction touched.
    v_flag := 'display_signal.' || lower(v_campus) || '_' || v_board;
    continue when coalesce(current_setting(v_flag, true), '') = 'sent';
    perform set_config(v_flag, 'sent', true);

    update display_signals
       set version = version + 1,
           changed_at = now()
     where campus = v_campus
       and board = v_board;
  end loop;

  return null;
end;
$fn$;

comment on function public.display_signal_on_change() is
  'Raises the display_signals version for the campus and board a changed row belongs to, once per transaction.';

-- Only ever runs as a trigger
revoke all on function public.display_signal_on_change() from public, anon, authenticated;

drop trigger if exists trg_display_signal on public.events;
create trigger trg_display_signal
  after insert or update or delete on public.events
  for each row execute function public.display_signal_on_change();

drop trigger if exists trg_display_signal on public.event_sessions;
create trigger trg_display_signal
  after insert or update or delete on public.event_sessions
  for each row execute function public.display_signal_on_change();

drop trigger if exists trg_display_signal on public.event_tasks;
create trigger trg_display_signal
  after insert or update or delete on public.event_tasks
  for each row execute function public.display_signal_on_change();

drop trigger if exists trg_display_signal on public.attachments;
create trigger trg_display_signal
  after insert or update or delete on public.attachments
  for each row execute function public.display_signal_on_change();

drop trigger if exists trg_display_signal on public.department_requests;
create trigger trg_display_signal
  after insert or update or delete on public.department_requests
  for each row execute function public.display_signal_on_change();

-- Let open boards hear about the signal rows over Realtime
do $pub$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'display_signals'
  ) then
    alter publication supabase_realtime add table public.display_signals;
  end if;
end;
$pub$;
