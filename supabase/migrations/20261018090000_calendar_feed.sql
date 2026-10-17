-- ============================================================
-- Calendar subscription links (Google Calendar, Apple Calendar, Outlook).
--
-- Each campus gets a link such as
--   https://hs-opt.netlify.app/calendar/hsc.ics?key=<key>
-- which a calendar app checks every few hours. The Netlify function behind
-- that address calls calendar_feed() below with the key from the link, and
-- turns the answer into a calendar file.
--
-- - calendar_feed_keys holds the one secret key that every link carries.
--   Anyone signed in to the app can read it, to copy their campus's link.
-- - rotate_calendar_feed_key() makes a new key, for the Events team only.
--   Every link made with the old key stops working.
-- - calendar_feed(key, campus) answers only when the key is right: the
--   campus's events (drafts left out) from four months back to a year
--   ahead, with their sessions (hidden ones left out) and contacts.
--   Internal notes are never included.
--
-- Additive and safe to run again. Run after 20261017090000_event_end_date.sql.
-- ============================================================

create table if not exists public.calendar_feed_keys (
  id smallint primary key default 1 check (id = 1),
  key text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.calendar_feed_keys is
  'The secret key in every calendar subscription link. One row. Make a new one with rotate_calendar_feed_key().';

insert into public.calendar_feed_keys (id) values (1) on conflict (id) do nothing;

alter table public.calendar_feed_keys enable row level security;

-- Signed-in users read the key to copy a link. Nobody writes it directly.
do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'calendar_feed_keys' and policyname = 'calendar_feed_keys_read'
  ) then
    create policy calendar_feed_keys_read on public.calendar_feed_keys
      for select to authenticated using (true);
  end if;
end;
$policy$;

grant select on public.calendar_feed_keys to authenticated;

-- A new key for every link. The old links stop working at once.
create or replace function public.rotate_calendar_feed_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_key text;
begin
  if not public.is_events_team() then
    raise exception 'Only the Events team can make new calendar links' using errcode = '42501';
  end if;
  update public.calendar_feed_keys
    set key = replace(gen_random_uuid()::text, '-', ''),
        created_at = now(),
        created_by = auth.uid()
    where id = 1
    returning key into new_key;
  return new_key;
end;
$$;

grant execute on function public.rotate_calendar_feed_key() to authenticated;

-- What one campus's calendar shows. Null when the key is wrong.
create or replace function public.calendar_feed(p_key text, p_campus text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_key is null or p_campus is null
     or not exists (select 1 from public.calendar_feed_keys k where k.key = p_key) then
    return null;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ev.id,
      'name', ev.name,
      'campus', ev.campus,
      'status', ev.status,
      'event_date', ev.event_date,
      'end_date', ev.end_date,
      'location', ev.location,
      'setup_start', ev.setup_start,
      'event_start', ev.event_start,
      'event_finish', ev.event_finish,
      'updated_at', ev.updated_at,
      'contacts', coalesce(ev.contacts, '[]'::jsonb),
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'title', s.title,
          'session_date', s.session_date,
          'start_time', s.start_time,
          'end_time', s.end_time,
          'location', s.location,
          'time_note', s.time_note,
          'note', s.note,
          'sort_order', s.sort_order,
          'updated_at', s.updated_at
        ) order by s.session_date, s.sort_order, s.created_at), '[]'::jsonb)
        from public.event_sessions s
        where s.event_id = ev.id and s.is_hidden = false
      )
    ) order by ev.event_date, ev.name), '[]'::jsonb)
    from public.events ev
    where ev.deleted_at is null
      and ev.status <> 'draft'
      and ev.campus = p_campus
      and coalesce(ev.end_date, ev.event_date) >= today - 120
      and ev.event_date <= today + 400
  );
end;
$$;

grant execute on function public.calendar_feed(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- Rollback (run only to undo this migration)
--   drop function if exists public.calendar_feed(text, text);
--   drop function if exists public.rotate_calendar_feed_key();
--   drop table if exists public.calendar_feed_keys;
-- ============================================================
