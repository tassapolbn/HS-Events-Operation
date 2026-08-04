-- ============================================================
-- Migration 013: Board sign-off (marked by / acknowledged by)
-- Support staff read the board without an account. They may mark a
-- job done or acknowledged and type their name. These columns hold
-- that name and the acknowledge time. The actual write path is a
-- security-definer function (added in the RPC migration) that only
-- ever sets status and these fields, never any other data.
-- Additive and reversible. Run after 012_request_times.sql.
-- ============================================================

alter table event_tasks
  add column if not exists completed_by text not null default '',
  add column if not exists acknowledged_by text not null default '',
  add column if not exists acknowledged_at timestamptz;

alter table department_requests
  add column if not exists completed_by text not null default '',
  add column if not exists acknowledged_by text not null default '',
  add column if not exists acknowledged_at timestamptz;

-- ============================================================
-- Rollback (run only to undo this migration)
-- ============================================================
-- alter table event_tasks drop column if exists completed_by;
-- alter table event_tasks drop column if exists acknowledged_by;
-- alter table event_tasks drop column if exists acknowledged_at;
-- alter table department_requests drop column if exists completed_by;
-- alter table department_requests drop column if exists acknowledged_by;
-- alter table department_requests drop column if exists acknowledged_at;
