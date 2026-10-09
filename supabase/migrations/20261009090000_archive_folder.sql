-- ============================================================
-- Archive folder for finished events and department requests.
--
-- Past and completed work piles up in the Events and Department Requests
-- lists. Archiving files it away into a separate Archive folder, where it can
-- be reviewed, restored if it was filed by mistake, or ticked and deleted.
--
-- Events already have an 'archived' status, and the display board, the
-- dashboard and board questions all leave archived events out. That status
-- stays the marker, so an event archived from the Archive folder and one set to
-- "Archived" in the event form behave the same. Three new columns record when
-- it was archived, by whom, and which status to go back to on restore. A
-- trigger keeps them in step with the status, whichever screen changed it.
--
-- Requests have no archived status (their status type is shared with event
-- tasks), and the Archive folder should still show whether a request was
-- completed, cancelled or never done. So a request keeps its status and gets
-- an archived_at stamp instead. The requests board now leaves archived
-- requests out, including overdue ones that would otherwise stay on it.
--
-- Deleting from the Archive folder is the same soft delete (deleted_at) as
-- every other delete in the app.
--
-- Additive and reversible. Run after 20260927050000_display_live_signal.sql.
-- ============================================================

-- ---------- Events ----------
alter table public.events
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid
    constraint events_archived_by_fkey references public.profiles (id) on delete set null,
  add column if not exists status_before_archive event_status;

comment on column public.events.archived_at is
  'When the event moved to the Archive folder. Set and cleared automatically with the archived status.';
comment on column public.events.archived_by is
  'Who archived the event. Set and cleared automatically with the archived status.';
comment on column public.events.status_before_archive is
  'The status to return to when the event is restored. Null means completed.';

-- Events archived before this migration (through the event form) get a date,
-- so they sort sensibly in the Archive folder. Their earlier status is not
-- known, so restoring them returns them to completed. This runs before the
-- trigger below exists, because the trigger keeps archive stamps fixed.
update public.events
   set archived_at = updated_at
 where status = 'archived'
   and archived_at is null;

create or replace function public.events_archive_bookkeeping()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if tg_op = 'UPDATE' and old.status = 'archived' and new.status = 'archived' then
    -- Still archived: the stamps describe when it was filed, keep them
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
    new.status_before_archive := old.status_before_archive;
  elsif new.status = 'archived' then
    -- Just archived, from the Archive folder or the event form
    new.archived_at := now();
    new.archived_by := auth.uid();
    new.status_before_archive := case when tg_op = 'UPDATE' then old.status end;
  else
    -- Not archived, or just restored
    new.archived_at := null;
    new.archived_by := null;
    new.status_before_archive := null;
  end if;
  return new;
end;
$fn$;

comment on function public.events_archive_bookkeeping() is
  'Keeps events.archived_at, archived_by and status_before_archive in step with the archived status.';

-- Only ever runs as a trigger
revoke all on function public.events_archive_bookkeeping() from public, anon, authenticated;

drop trigger if exists trg_events_archive on public.events;
create trigger trg_events_archive
  before insert or update on public.events
  for each row execute function public.events_archive_bookkeeping();

-- ---------- Department requests ----------
alter table public.department_requests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid
    constraint department_requests_archived_by_fkey references public.profiles (id) on delete set null;

comment on column public.department_requests.archived_at is
  'When the request moved to the Archive folder. Null means it is active. The status is kept as it was.';
comment on column public.department_requests.archived_by is
  'Who archived the request. Set and cleared automatically with archived_at.';

-- The app asks to archive by setting archived_at to any time and to restore by
-- clearing it. The stamp itself always comes from the database clock and the
-- signed-in account, never from the browser.
create or replace function public.requests_archive_bookkeeping()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    -- New requests always start in the active list
    new.archived_at := null;
    new.archived_by := null;
  elsif (new.archived_at is null) = (old.archived_at is null) then
    -- Not moving in or out of the archive: the stamps stay as they were
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
  elsif auth.uid() is not null and not is_events_team() then
    -- A department may update its own requests, but only the Events Team
    -- files them away or brings them back
    raise exception 'Only the Events Team can archive or restore requests'
      using errcode = '42501';
  elsif new.archived_at is not null then
    new.archived_at := now();
    new.archived_by := auth.uid();
  else
    new.archived_by := null;
  end if;
  return new;
end;
$fn$;

comment on function public.requests_archive_bookkeeping() is
  'Stamps department_requests.archived_at / archived_by on archive and restore, and limits both to the Events Team.';

revoke all on function public.requests_archive_bookkeeping() from public, anon, authenticated;

drop trigger if exists trg_requests_archive on public.department_requests;
create trigger trg_requests_archive
  before insert or update on public.department_requests
  for each row execute function public.requests_archive_bookkeeping();

-- ---------- Requests board: leave archived requests out ----------
-- Unchanged from 20260916143212_support_board_schedule.sql apart from the
-- archived_at condition. Archived events need no change: the events board
-- already skips the archived status.
create or replace function public_display_requests(p_campus text default null)
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

grant execute on function public.public_display_requests(text) to anon, authenticated;

-- ============================================================
-- Rollback (run only to undo this migration). Archived requests return to the
-- lists and the board; events keep their archived status.
--   drop trigger if exists trg_requests_archive on public.department_requests;
--   drop function if exists public.requests_archive_bookkeeping();
--   drop trigger if exists trg_events_archive on public.events;
--   drop function if exists public.events_archive_bookkeeping();
--   then re-run public_display_requests from 20260916143212_support_board_schedule.sql
--   alter table public.department_requests drop column if exists archived_by, drop column if exists archived_at;
--   alter table public.events drop column if exists status_before_archive,
--     drop column if exists archived_by, drop column if exists archived_at;
-- ============================================================
