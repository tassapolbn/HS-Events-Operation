-- ============================================================
-- Migration 012: Setup and teardown times on department requests
-- Optional full timestamps so the board can sort and compare
-- reliably. Both may be null. Timezone stays Asia/Bangkok, handled
-- in the app when combining the date with the entered time.
-- Additive and reversible. Run after 011_department_contacts.sql.
-- ============================================================

alter table department_requests
  add column if not exists setup_datetime timestamptz,
  add column if not exists teardown_datetime timestamptz;

-- ============================================================
-- Rollback (run only to undo this migration)
-- ============================================================
-- alter table department_requests drop column if exists setup_datetime;
-- alter table department_requests drop column if exists teardown_datetime;
