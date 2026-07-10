-- ============================================================
-- Migration 003: Seed data (departments with notification emails)
-- Run after 002_security.sql
-- ============================================================

insert into departments (code, name_en, name_th, color, icon, emails, sort_order) values
  (
    'maintenance',
    'Maintenance & Gardener',
    'ซ่อมบำรุงและสวน',
    '#0d9488',
    'wrench',
    array['maintenance.city@headstartphuket.com', 'maintenance@headstartphuket.com'],
    1
  ),
  (
    'housekeeping',
    'Housekeeping',
    'แม่บ้าน',
    '#dc2626',
    'sparkles',
    array['housekeeping.city@headstartphuket.com', 'housekeeping@headstartphuket.com'],
    2
  ),
  (
    'security',
    'Security & Driver',
    'รักษาความปลอดภัยและพนักงานขับรถ',
    '#d97706',
    'shield',
    array['security.city@headstartphuket.com'],
    3
  ),
  (
    'kitchen',
    'Kitchen / Food Service',
    'ครัว / โภชนาการ',
    '#16a34a',
    'chef-hat',
    array['executivechef@headstartphuket.com', 'headchef.city@headstartphuket.com'],
    4
  )
on conflict (code) do nothing;

-- ============================================================
-- AFTER YOUR FIRST LOGIN, make yourself the administrator by
-- running this (replace with your real email):
--
-- update profiles set role = 'admin' where email = 'your.email@headstartphuket.com';
-- ============================================================
