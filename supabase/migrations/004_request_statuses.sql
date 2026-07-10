-- ============================================================
-- Migration 004: New request statuses
-- Run this file ALONE first (enum values cannot be added and
-- used in the same run), then run 005.
-- ============================================================

alter type task_status add value if not exists 'new';
alter type task_status add value if not exists 'acknowledged';
alter type task_status add value if not exists 'needs_revision';
