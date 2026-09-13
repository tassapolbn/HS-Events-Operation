-- Integration regression: all sample records and audit entries roll back.
begin;
do $$
declare
  actor uuid;
  department uuid;
  event_key uuid;
  session_key uuid;
  anchor_key uuid;
  other_key uuid;
  created_ids uuid[];
  amount integer;
begin
  select id into actor from public.profiles where role in ('admin','events_team') limit 1;
  select id into department from public.departments limit 1;
  if actor is null or department is null then raise exception 'An admin and department are required for this regression'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.events(name,event_date,campus,created_by) values ('Worksheet rollback regression',current_date,'HSC',actor) returning id into event_key;
  insert into public.event_sessions(event_id,session_date,title) values(event_key,current_date,'Regression session') returning id into session_key;
  insert into public.event_tasks(event_id,department_id,session_id,title,sort_order,created_by) values(event_key,department,session_key,'Anchor',0,actor) returning id into anchor_key;
  insert into public.event_tasks(event_id,department_id,session_id,title,sort_order,created_by) values(event_key,department,session_key,'Next',0,actor) returning id into other_key;
  select array_agg(id order by sort_order) into created_ids from public.insert_task_rows(event_key,anchor_key,'above',2);
  assert array_length(created_ids,1)=2, 'Inserted row count';
  assert (select max(sort_order) from public.event_tasks where id=any(created_ids)) < (select sort_order from public.event_tasks where id=anchor_key), 'Rows must appear above the anchor';
  assert (select bool_and(event_id=event_key and department_id=department and session_id=session_key and title='' and status='not_started') from public.event_tasks where id=any(created_ids)), 'New rows must inherit only the correct context';
  select array_agg(id) into created_ids from public.insert_task_rows(event_key,anchor_key,'below',1);
  assert (select min(sort_order) from public.event_tasks where id=any(created_ids)) = (select sort_order+1 from public.event_tasks where id=anchor_key), 'Row must appear directly below anchor';
  select count(*) into amount from public.event_tasks where event_id=event_key;
  assert amount=5, 'Expected five rows';
  assert (select count(distinct sort_order) from public.event_tasks where event_id=event_key)=amount, 'Ordering must remain unique even with initial ties';
  begin
    perform public.insert_task_rows(event_key,anchor_key,'below',0);
    raise exception 'Invalid count was accepted' using errcode='P0002';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform public.insert_task_rows(event_key,gen_random_uuid(),'below',1);
    raise exception 'Unavailable anchor was accepted';
  exception when insufficient_privilege then null; end;
  update public.event_tasks set deleted_at=now() where id=anchor_key;
  begin
    perform public.insert_task_rows(event_key,anchor_key,'above',1);
    raise exception 'Deleted anchor was accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  begin
    perform public.insert_task_rows(event_key,other_key,'above',1);
    raise exception 'Unauthorized actor was accepted';
  exception when insufficient_privilege then null; end;
  assert not has_function_privilege('anon','public.insert_task_rows(uuid,uuid,text,integer)','EXECUTE'), 'Anonymous role cannot insert';
end;
$$;
rollback;
select 'PASS: insert above/below, stable order, context, invalid input, deleted anchor, authorization; sample data rolled back' as regression;
