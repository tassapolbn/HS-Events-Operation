-- ============================================================
-- Announcements, saved contacts, a problem log, one search box,
-- and PowerPoint files.
--
-- 1. client_errors: when something fails in someone's browser (an upload that
--    is refused, a save that does not go through, a page that crashes) the app
--    writes it here, so an admin sees it on the Dashboard before anyone has to
--    report it. Written only through log_client_error(), which counts a repeat
--    instead of storing it again, stops at 200 new entries a day, and forgets
--    entries nobody has seen for 60 days.
--
-- 2. announcements: short notices pinned to the top of the Dashboard and, when
--    chosen, the display board of one campus or both. Each has a first and an
--    optional last day; outside those days it is simply not shown.
--
-- 3. saved_contacts: people and suppliers kept once and ticked into an event's
--    contacts, instead of typing the same name, phone and email every time.
--    An event still keeps its own copy of each contact (events.contacts), so a
--    past event shows who was asked at the time.
--
-- 4. search_everything(): one search for the box in the top bar. It runs with
--    the caller's own rights, so nobody finds anything they cannot already see.
--
-- 5. The attachments bucket also accepts PowerPoint files.
--
-- Additive and safe to run again. Run after
-- 20261009120000_board_feeds_refresh_notice.sql.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Problems people met in the app
-- ------------------------------------------------------------

create table if not exists public.client_errors (
  id         uuid        primary key default gen_random_uuid(),
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  times      integer     not null default 1,
  user_id    uuid        references public.profiles (id) on delete set null,
  kind       text        not null default 'error',
  message    text        not null,
  detail     text        not null default '',
  page       text        not null default '',
  build      text        not null default '',
  browser    text        not null default ''
);

comment on table public.client_errors is
  'Problems people met in their browser: refused uploads, failed saves, crashes. Written by log_client_error(), read by admins on the Dashboard.';

create index if not exists client_errors_last_seen on public.client_errors (last_seen desc);

alter table public.client_errors enable row level security;

drop policy if exists client_errors_admin_read on public.client_errors;
create policy client_errors_admin_read on public.client_errors
  for select to authenticated using ((select public.get_my_role()) = 'admin');

drop policy if exists client_errors_admin_delete on public.client_errors;
create policy client_errors_admin_delete on public.client_errors
  for delete to authenticated using ((select public.get_my_role()) = 'admin');

-- Rows only ever arrive through log_client_error()
revoke insert, update, truncate, references, trigger on public.client_errors from anon, authenticated;
revoke all on public.client_errors from anon;

create or replace function public.log_client_error(
  p_kind    text,
  p_message text,
  p_detail  text default '',
  p_page    text default '',
  p_build   text default '',
  p_browser text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user    uuid := auth.uid();
  v_kind    text := left(coalesce(nullif(btrim(p_kind), ''), 'error'), 20);
  v_message text := left(btrim(coalesce(p_message, '')), 500);
  v_detail  text := left(coalesce(p_detail, ''), 1000);
  v_page    text := left(coalesce(p_page, ''), 200);
  v_build   text := left(coalesce(p_build, ''), 60);
  v_browser text := left(coalesce(p_browser, ''), 200);
begin
  if v_message = '' then
    return;
  end if;

  -- The same problem for the same person within six hours is counted, not
  -- stored again, so one broken button pressed ten times is one line.
  update client_errors
     set times = times + 1,
         last_seen = now(),
         detail = v_detail,
         page = v_page,
         build = v_build,
         browser = v_browser
   where user_id is not distinct from v_user
     and kind = v_kind
     and message = v_message
     and last_seen > now() - interval '6 hours';
  if found then
    return;
  end if;

  -- A flood (a broken release, or someone misusing this) stops at 200 new
  -- entries a day; the first ones already say what is wrong.
  if (select count(*) from client_errors where first_seen > now() - interval '1 day') >= 200 then
    return;
  end if;

  insert into client_errors (user_id, kind, message, detail, page, build, browser)
  values (v_user, v_kind, v_message, v_detail, v_page, v_build, v_browser);

  -- Keep the table small
  delete from client_errors where last_seen < now() - interval '60 days';
end;
$fn$;

comment on function public.log_client_error(text, text, text, text, text, text) is
  'Records a problem met in the browser. Repeats within six hours are counted; at most 200 new entries a day.';

-- Display boards are used without signing in, so they may report problems too
revoke all on function public.log_client_error(text, text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 2. Announcements
-- ------------------------------------------------------------

create table if not exists public.announcements (
  id            uuid        primary key default gen_random_uuid(),
  message       text        not null,
  tone          text        not null default 'info',
  starts_on     date        not null default ((now() at time zone 'Asia/Bangkok')::date),
  ends_on       date,
  show_on_board boolean     not null default false,
  campus        text,
  created_by    uuid        references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint announcements_message check (btrim(message) <> '' and char_length(message) <= 1000),
  constraint announcements_tone check (tone in ('info', 'warning', 'urgent')),
  constraint announcements_campus check (campus is null or campus in ('HSC', 'HSN')),
  constraint announcements_dates check (ends_on is null or ends_on >= starts_on)
);

comment on table public.announcements is
  'Short notices on the Dashboard and, when show_on_board is set, the display board. campus null means both campuses; ends_on null means until removed.';

create index if not exists announcements_ends_on on public.announcements (ends_on);

drop trigger if exists trg_announcements_updated on public.announcements;
create trigger trg_announcements_updated before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to authenticated using (true);

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements
  for insert to authenticated with check ((select public.is_events_team()));

drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements
  for update to authenticated
  using ((select public.is_events_team()))
  with check ((select public.is_events_team()));

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements
  for delete to authenticated using ((select public.is_events_team()));

revoke all on public.announcements from anon;

-- What a display board shows: today's notices for its campus, most urgent first
create or replace function public.public_board_announcements(p_campus text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'message', a.message,
           'tone', a.tone
         ) order by case a.tone when 'urgent' then 0 when 'warning' then 1 else 2 end,
                    a.starts_on desc, a.created_at desc), '[]'::jsonb)
  from announcements a
  where a.show_on_board
    and a.starts_on <= (now() at time zone 'Asia/Bangkok')::date
    and (a.ends_on is null or a.ends_on >= (now() at time zone 'Asia/Bangkok')::date)
    and (p_campus is null or a.campus is null or a.campus = p_campus);
$fn$;

comment on function public.public_board_announcements(text) is
  'Announcements a display board shows today, for one campus or every campus.';

revoke all on function public.public_board_announcements(text) from public;
grant execute on function public.public_board_announcements(text) to anon, authenticated;

-- An announcement on a board wakes that board, the same way an edited event
-- does (see 20260927050000_display_live_signal.sql). It travels with the
-- events signal and shares its once-per-transaction flag.
create or replace function public.display_signal_on_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row      jsonb;
  v_campuses text[];
  v_campus   text;
  v_flag     text;
begin
  foreach v_row in array array_remove(array[
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  ], null) loop
    continue when not coalesce((v_row ->> 'show_on_board')::boolean, false);
    v_campuses := case when v_row ->> 'campus' is null then array['HSC', 'HSN'] else array[v_row ->> 'campus'] end;
    foreach v_campus in array v_campuses loop
      v_flag := 'display_signal.' || lower(v_campus) || '_events';
      continue when coalesce(current_setting(v_flag, true), '') = 'sent';
      perform set_config(v_flag, 'sent', true);
      update display_signals
         set version = version + 1,
             changed_at = now()
       where campus = v_campus
         and board = 'events';
    end loop;
  end loop;
  return null;
end;
$fn$;

comment on function public.display_signal_on_announcement() is
  'Raises the events display signal of the campus an announcement shows on, once per transaction.';

revoke all on function public.display_signal_on_announcement() from public, anon, authenticated;

drop trigger if exists trg_display_signal on public.announcements;
create trigger trg_display_signal
  after insert or update or delete on public.announcements
  for each row execute function public.display_signal_on_announcement();


-- ------------------------------------------------------------
-- 3. Saved contacts
-- ------------------------------------------------------------

create table if not exists public.saved_contacts (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  role       text        not null default '',
  phone      text        not null default '',
  email      text        not null default '',
  created_by uuid        references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_contacts_name check (btrim(name) <> '' and char_length(name) <= 120),
  constraint saved_contacts_lengths check (
    char_length(role) <= 120 and char_length(phone) <= 60 and char_length(email) <= 200
  )
);

comment on table public.saved_contacts is
  'People and suppliers kept for reuse. Ticking one into an event copies it into events.contacts with its id as contact_id.';

create index if not exists saved_contacts_name on public.saved_contacts (lower(name));

drop trigger if exists trg_saved_contacts_updated on public.saved_contacts;
create trigger trg_saved_contacts_updated before update on public.saved_contacts
  for each row execute function public.set_updated_at();

alter table public.saved_contacts enable row level security;

-- Everyone signed in can look a number up; the Events team keeps the list
drop policy if exists saved_contacts_read on public.saved_contacts;
create policy saved_contacts_read on public.saved_contacts
  for select to authenticated using (true);

drop policy if exists saved_contacts_insert on public.saved_contacts;
create policy saved_contacts_insert on public.saved_contacts
  for insert to authenticated with check ((select public.is_events_team()));

drop policy if exists saved_contacts_update on public.saved_contacts;
create policy saved_contacts_update on public.saved_contacts
  for update to authenticated
  using ((select public.is_events_team()))
  with check ((select public.is_events_team()));

drop policy if exists saved_contacts_delete on public.saved_contacts;
create policy saved_contacts_delete on public.saved_contacts
  for delete to authenticated using ((select public.is_events_team()));

revoke all on public.saved_contacts from anon;


-- ------------------------------------------------------------
-- 4. One search for the whole app
-- ------------------------------------------------------------

create or replace function public.search_everything(p_query text, p_limit integer default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $fn$
declare
  v_query  text := btrim(coalesce(p_query, ''));
  v_like   text;
  v_digits text;
  v_limit  integer := least(greatest(coalesce(p_limit, 6), 1), 20);
  v_today  date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if char_length(v_query) < 2 then
    return jsonb_build_object('events', '[]'::jsonb, 'tasks', '[]'::jsonb, 'requests', '[]'::jsonb,
                              'contacts', '[]'::jsonb, 'people', '[]'::jsonb);
  end if;

  -- Typed text is matched literally: % and _ are not wildcards here
  v_like := '%' || replace(replace(replace(left(v_query, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- "0812345678" also finds "081-234-5678"
  v_digits := regexp_replace(v_query, '\D', '', 'g');
  if char_length(v_digits) < 3 then
    v_digits := null;
  end if;

  return jsonb_build_object(
    'events', (
      select coalesce(jsonb_agg(to_jsonb(hit)), '[]'::jsonb)
      from (
        select ev.id, ev.name, ev.event_date, ev.campus, ev.location, ev.status,
               (ev.status = 'archived' or ev.archived_at is not null) as archived
        from events ev
        where ev.deleted_at is null
          and (ev.name ilike v_like
            or ev.location ilike v_like
            or ev.category ilike v_like
            or exists (
              select 1 from jsonb_array_elements(coalesce(ev.contacts, '[]'::jsonb)) person
              where person.value ->> 'name' ilike v_like
                 or person.value ->> 'phone' ilike v_like
            ))
        order by (ev.status = 'archived' or ev.archived_at is not null),
                 abs(ev.event_date - v_today), ev.name
        limit v_limit
      ) hit
    ),
    'tasks', (
      select coalesce(jsonb_agg(to_jsonb(hit)), '[]'::jsonb)
      from (
        select t.id, t.title, t.event_id, ev.name as event_name, ev.event_date, ev.campus,
               t.department_id, t.status, t.assigned_staff,
               (ev.status = 'archived' or ev.archived_at is not null) as archived
        from event_tasks t
        join events ev on ev.id = t.event_id
        where t.deleted_at is null
          and ev.deleted_at is null
          and (t.title ilike v_like
            or t.assigned_staff ilike v_like
            or t.work_location ilike v_like
            or t.setup_location ilike v_like)
        order by (ev.status = 'archived' or ev.archived_at is not null),
                 abs(ev.event_date - v_today), t.title
        limit v_limit
      ) hit
    ),
    'requests', (
      select coalesce(jsonb_agg(to_jsonb(hit)), '[]'::jsonb)
      from (
        select r.id, r.title, r.reference, r.request_date, r.due_date, r.campus, r.department_id,
               r.status, r.location, (r.archived_at is not null) as archived
        from department_requests r
        where r.deleted_at is null
          and (r.title ilike v_like
            or r.reference ilike v_like
            or r.location ilike v_like
            or r.head_responsible ilike v_like)
        order by (r.archived_at is not null),
                 abs(coalesce(r.due_date, r.request_date) - v_today), r.title
        limit v_limit
      ) hit
    ),
    'contacts', (
      select coalesce(jsonb_agg(to_jsonb(hit)), '[]'::jsonb)
      from (
        select c.id, c.name, c.role, c.phone, c.email
        from saved_contacts c
        where c.name ilike v_like
           or c.role ilike v_like
           or c.email ilike v_like
           or c.phone ilike v_like
           or (v_digits is not null and regexp_replace(c.phone, '\D', '', 'g') like '%' || v_digits || '%')
        order by lower(c.name)
        limit v_limit
      ) hit
    ),
    'people', (
      select coalesce(jsonb_agg(to_jsonb(hit)), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.role, p.department_id
        from profiles p
        where p.is_active
          and (p.full_name ilike v_like
            or p.email ilike v_like
            or coalesce(p.username, '') ilike v_like)
        order by lower(p.full_name)
        limit v_limit
      ) hit
    )
  );
end;
$fn$;

comment on function public.search_everything(text, integer) is
  'The top bar search: events, jobs, requests, saved contacts and people matching the text, within what the caller may see.';

revoke all on function public.search_everything(text, integer) from public, anon;
grant execute on function public.search_everything(text, integer) to authenticated;


-- ------------------------------------------------------------
-- 5. PowerPoint files in the attachments bucket
-- ------------------------------------------------------------

update storage.buckets
   set allowed_mime_types = allowed_mime_types || array(
         select wanted
         from unnest(array[
           'application/vnd.openxmlformats-officedocument.presentationml.presentation',
           'application/vnd.ms-powerpoint'
         ]) as wanted
         where not (wanted = any (allowed_mime_types))
       )
 where id = 'attachments'
   and allowed_mime_types is not null;

notify pgrst, 'reload schema';

-- ============================================================
-- Rollback (run only to undo this migration)
--   drop function if exists public.search_everything(text, integer);
--   drop table if exists public.saved_contacts;
--   drop trigger if exists trg_display_signal on public.announcements;
--   drop function if exists public.display_signal_on_announcement();
--   drop function if exists public.public_board_announcements(text);
--   drop table if exists public.announcements;
--   drop function if exists public.log_client_error(text, text, text, text, text, text);
--   drop table if exists public.client_errors;
--   update storage.buckets set allowed_mime_types = array_remove(array_remove(allowed_mime_types,
--     'application/vnd.openxmlformats-officedocument.presentationml.presentation'), 'application/vnd.ms-powerpoint')
--     where id = 'attachments';
-- ============================================================
