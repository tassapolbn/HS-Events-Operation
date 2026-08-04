-- ============================================================
-- Migration 010: Two-campus support (HSC, HSN)
-- Adds a campus tag to the campus-scoped root tables. Every
-- existing row belongs to HSC and is backfilled accordingly.
-- Tasks and sessions inherit their campus from the parent event,
-- so they are intentionally not given their own campus column.
-- Additive and reversible. Run after 009_session_notes.sql.
-- ============================================================

-- ---------- Events ----------
alter table events add column if not exists campus text;
update events set campus = 'HSC' where campus is null;
-- Interim default so back-office creation keeps working until the Phase 4
-- campus selector sets it explicitly. All current data is HSC.
alter table events alter column campus set default 'HSC';
alter table events alter column campus set not null;
alter table events drop constraint if exists events_campus_check;
alter table events add constraint events_campus_check check (campus in ('HSC', 'HSN'));
create index if not exists idx_events_campus_date on events (campus, event_date) where deleted_at is null;

-- ---------- Department requests ----------
alter table department_requests add column if not exists campus text;
update department_requests set campus = 'HSC' where campus is null;
alter table department_requests alter column campus set default 'HSC';
alter table department_requests alter column campus set not null;
alter table department_requests drop constraint if exists department_requests_campus_check;
alter table department_requests add constraint department_requests_campus_check check (campus in ('HSC', 'HSN'));
create index if not exists idx_requests_campus_due on department_requests (campus, due_date) where deleted_at is null;

-- ---------- Templates stay shared ----------
-- Nullable campus, NULL means shared across both campuses. No UI for
-- campus-specific templates yet, per the brief.
alter table event_templates add column if not exists campus text;
alter table event_templates drop constraint if exists event_templates_campus_check;
alter table event_templates add constraint event_templates_campus_check check (campus is null or campus in ('HSC', 'HSN'));

-- ============================================================
-- Rollback (run only to undo this migration)
-- ============================================================
-- alter table events drop constraint if exists events_campus_check;
-- drop index if exists idx_events_campus_date;
-- alter table events drop column if exists campus;
-- alter table department_requests drop constraint if exists department_requests_campus_check;
-- drop index if exists idx_requests_campus_due;
-- alter table department_requests drop column if exists campus;
-- alter table event_templates drop constraint if exists event_templates_campus_check;
-- alter table event_templates drop column if exists campus;
