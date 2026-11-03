import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJobIndex, normalizeJobTitle, suggestJobs } from '../src/lib/jobSuggestions.ts';

const row = (title, department_id, created_at) => ({ title, department_id, created_at });
const index = buildJobIndex([
  row('ยกเก้าอี้ 120 ตัว', 'sec', '2026-10-01T00:00:00Z'),
  row('ยกเก้าอี้  120 ตัว ', 'sec', '2026-10-20T00:00:00Z'),
  row('ยกเก้าอี้ 120 ตัว', 'sec', '2026-09-01T00:00:00Z'),
  row('ยกโต๊ะ 3 ตัว', 'sec', '2026-10-25T00:00:00Z'),
  row('เตรียมเก้าอี้สำรอง', 'sec', '2026-10-30T00:00:00Z'),
  row('เก้าอี้พับ 10 ตัว', 'sec', '2026-08-01T00:00:00Z'),
  row('Move chairs to the hall', 'sec', '2026-10-02T00:00:00Z'),
  row('คลุมผ้าโต๊ะ 3 ผืน', 'hk', '2026-10-01T00:00:00Z'),
  row('   ', 'hk', '2026-10-01T00:00:00Z')
]);

test('titles are trimmed and inner spaces collapsed', () => {
  assert.equal(normalizeJobTitle('  ยก   เก้าอี้ \n 2 ตัว '), 'ยก เก้าอี้ 2 ตัว');
});

test('one entry per department and job, counted, keeping the latest spelling and skipping blanks', () => {
  const security = index.get('sec');
  const chairs = security.find((job) => job.title === 'ยกเก้าอี้ 120 ตัว');
  assert.equal(chairs.count, 3);
  assert.equal(chairs.last, '2026-10-20T00:00:00Z');
  assert.equal(index.get('hk').length, 1);
});

test('jobs that start with the text come first, then the most often given, then the latest', () => {
  // Starts with the text, though given once, before contains-matches given more often
  assert.deepEqual(suggestJobs(index, 'sec', 'เก้าอี้'), ['เก้าอี้พับ 10 ตัว', 'ยกเก้าอี้ 120 ตัว', 'เตรียมเก้าอี้สำรอง']);
  assert.deepEqual(suggestJobs(index, 'sec', 'ยก'), ['ยกเก้าอี้ 120 ตัว', 'ยกโต๊ะ 3 ตัว']);
  // Same count: the most recent first
  assert.deepEqual(suggestJobs(index, 'sec', 'ตัว'), ['ยกเก้าอี้ 120 ตัว', 'ยกโต๊ะ 3 ตัว', 'เก้าอี้พับ 10 ตัว']);
});

test('matching ignores case and extra spaces, and never offers the text itself', () => {
  assert.deepEqual(suggestJobs(index, 'sec', '  MOVE  chairs'), ['Move chairs to the hall']);
  assert.deepEqual(suggestJobs(index, 'sec', 'ยกโต๊ะ 3 ตัว'), []);
});

test('nothing for under two characters, for another department or past the limit', () => {
  assert.deepEqual(suggestJobs(index, 'sec', 'ย'), []);
  assert.deepEqual(suggestJobs(index, 'kitchen', 'ยก'), []);
  assert.equal(suggestJobs(index, 'sec', 'ยก', 1).length, 1);
});
