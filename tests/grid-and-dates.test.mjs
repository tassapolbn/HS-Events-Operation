import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesDateScope } from '../src/lib/boardDates.ts';
import { parseClipboardTable, toClipboardTable, normalizeTimeInput } from '../src/lib/grid.ts';

test('date categories include the correct boundary days across month and year changes', () => {
  assert.equal(matchesDateScope('2027-01-01', '2026-12-31', 'tomorrow'), true);
  assert.equal(matchesDateScope('2027-01-06', '2026-12-31', 'week'), true);
  assert.equal(matchesDateScope('2027-01-07', '2026-12-31', 'week'), false);
  assert.equal(matchesDateScope('2027-01-07', '2026-12-31', 'later'), true);
  assert.equal(matchesDateScope('2026-12-30', '2026-12-31', 'past'), true);
  assert.equal(matchesDateScope('2026-12-31', '2026-12-31', 'today'), true);
  assert.equal(matchesDateScope('2027-01-01', '2026-12-31', 'custom', '2027-01-02'), false);
});

test('Google Sheets clipboard round trip preserves Thai, quotes, tabs and multiline cells', () => {
  const rows = [['จัดโต๊ะ', 'ทีม A', '09:30'], ['จุด "ลงทะเบียน"', 'ชั้น 1\nหน้าห้อง\tA', '']];
  assert.deepEqual(parseClipboardTable(toClipboardTable(rows) + '\n'), rows);
});

test('time input rejects impossible times and normalizes shorthand', () => {
  assert.equal(normalizeTimeInput('9:30'), '09:30');
  assert.equal(normalizeTimeInput('25:00'), '');
  assert.equal(normalizeTimeInput('09:75'), '');
});
