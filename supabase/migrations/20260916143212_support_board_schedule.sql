-- Add an exact deadline without fabricating times for existing date-only work.
alter table public.department_requests add column if not exists due_at timestamptz;
alter table public.department_requests alter column request_date
  set default ((now() at time zone 'Asia/Bangkok')::date);
alter table public.department_requests add constraint request_deadline_after_start
  check (due_at is null or setup_datetime is null or due_at >= setup_datetime);

-- Retain the existing public board visibility and campus rules.
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
      and r.status <> 'cancelled'
      and (r.status <> 'completed' or r.updated_at > now() - interval '7 days')
      and (p_campus is null or r.campus = p_campus)
  ) sub;
$$;

grant execute on function public.public_display_requests(text) to anon, authenticated;
