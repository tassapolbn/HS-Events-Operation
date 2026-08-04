-- ============================================================
-- Migration 011: Per-campus department email routing
-- Departments stay four shared identities (same colours, icons,
-- board chips). Only their notification email(s) differ by campus,
-- so routing moves into an editable department_contacts table.
-- HSC addresses are migrated from departments.emails[] unchanged.
-- Additive and reversible. Run after 010_campus.sql.
-- ============================================================

create table if not exists department_contacts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id) on delete cascade,
  campus text not null check (campus in ('HSC', 'HSN')),
  email text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, campus, email)
);

create index if not exists idx_dept_contacts on department_contacts (campus, department_id) where is_active;

drop trigger if exists trg_dept_contacts_updated on department_contacts;
create trigger trg_dept_contacts_updated before update on department_contacts
  for each row execute function set_updated_at();

alter table department_contacts enable row level security;
drop policy if exists "dept_contacts_select" on department_contacts;
create policy "dept_contacts_select" on department_contacts
  for select to authenticated using (true);
drop policy if exists "dept_contacts_write" on department_contacts;
create policy "dept_contacts_write" on department_contacts
  for all to authenticated using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ---------- Backfill HSC unchanged from the current routing ----------
insert into department_contacts (department_id, campus, email, sort_order)
select d.id, 'HSC', e.email, e.ord::int
from departments d
cross join lateral unnest(d.emails) with ordinality as e(email, ord)
on conflict (department_id, campus, email) do nothing;

-- ---------- HSN routing from the brief, matched by department code ----------
insert into department_contacts (department_id, campus, email, sort_order)
select d.id, 'HSN', v.email, 1
from departments d
join (values
  ('housekeeping', 'housekeeping.north@headstartphuket.com'),
  ('security', 'security.north@headstartphuket.com'),
  ('maintenance', 'maintenance.north@headstartphuket.com'),
  ('kitchen', 'headchef.north@headstartphuket.com')
) as v(code, email) on v.code = d.code
on conflict (department_id, campus, email) do nothing;

-- ============================================================
-- Rollback (run only to undo this migration)
-- ============================================================
-- drop table if exists department_contacts;
