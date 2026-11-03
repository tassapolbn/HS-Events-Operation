-- Hide events archived while still drafts because they were never published.
-- Rollback: re-run public.calendar_feed from 20261018090000_calendar_feed.sql.

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
      -- An event archived while still a draft was never published
      and (ev.status <> 'archived' or ev.status_before_archive is distinct from 'draft')
      and ev.campus = p_campus
      and coalesce(ev.end_date, ev.event_date) >= today - 120
      and ev.event_date <= today + 400
  );
end;
$$;

grant execute on function public.calendar_feed(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
