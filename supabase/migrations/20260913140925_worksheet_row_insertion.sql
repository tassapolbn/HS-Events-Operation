-- Insert blank worksheet rows in the same session/department as the anchor.
-- Ordering and insertion succeed together; existing RLS still applies.
create or replace function public.insert_task_rows(
  p_event_id uuid, p_anchor_id uuid, p_position text, p_count integer default 1
) returns setof public.event_tasks
language plpgsql security invoker set search_path = public as $$
declare
  anchor public.event_tasks;
  insert_at integer;
begin
  if auth.uid() is null or not public.is_events_team() then
    raise exception 'Only the events team can insert worksheet rows' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 100 or p_position is null or p_position not in ('above','below') then
    raise exception 'Choose above/below and between 1 and 100 rows';
  end if;
  -- Serialize insertions into an event, then lock tasks in the same order as grid edits.
  perform 1 from public.events where id = p_event_id and deleted_at is null for update;
  if not found then raise exception 'Event is unavailable' using errcode = '42501'; end if;
  perform 1 from public.event_tasks where event_id = p_event_id and deleted_at is null order by id for update;
  select * into anchor from public.event_tasks where id = p_anchor_id and event_id = p_event_id and deleted_at is null;
  if not found then raise exception 'Task is unavailable; refresh the worksheet' using errcode = '42501'; end if;

  select position::integer - case when p_position = 'above' then 1 else 0 end into insert_at
  from (select id, row_number() over (order by sort_order, created_at, id) as position
    from public.event_tasks where event_id = p_event_id and department_id = anchor.department_id
      and session_id is not distinct from anchor.session_id and deleted_at is null) ordered
  where id = p_anchor_id;

  with ordered as (
    select id, (row_number() over (order by sort_order, created_at, id) - 1)::integer as position
    from public.event_tasks where event_id = p_event_id and department_id = anchor.department_id
      and session_id is not distinct from anchor.session_id and deleted_at is null
  ), shifted as (
    select id, position + case when position >= insert_at then p_count else 0 end as new_order from ordered
  )
  update public.event_tasks t set sort_order = shifted.new_order
    from shifted where t.id = shifted.id and t.sort_order is distinct from shifted.new_order;

  return query insert into public.event_tasks
    (event_id, department_id, session_id, title, assigned_staff, work_location, setup_location, sort_order, created_by)
    select p_event_id, anchor.department_id, anchor.session_id, '', anchor.assigned_staff,
      anchor.work_location, anchor.setup_location, insert_at + n, auth.uid()
    from generate_series(0, p_count - 1) n order by n
    returning *;
end;
$$;
revoke all on function public.insert_task_rows(uuid, uuid, text, integer) from public, anon;
grant execute on function public.insert_task_rows(uuid, uuid, text, integer) to authenticated;
