import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowAndNext, openJobsByDepartment } from '../src/lib/boardToday.ts';

const today = '2026-11-04';
const tomorrow = '2026-11-05';
const time = (day, hhmm) => `${day}T${hhmm}:00+07:00`;
const session = (id, day, start = null, end = null, extra = {}) => ({
  id, session_date: day, start_time: start && time(day, start), end_time: end && time(day, end), title: '', location: 'Atrium', sort_order: 0, ...extra
});
const job = (id, department_id, session_id, status = 'not_started') => ({ id, department_id, session_id, status });

const events = [
  {
    id: 'run', name: 'Phuket Run', event_date: today,
    sessions: [session('morning', today, '08:00', '10:00'), session('noon', today, '12:00'), session('next-day', tomorrow, '09:00')],
    tasks: [
      job('m1', 'hk', 'morning'), job('m2', 'hk', 'morning', 'completed'), job('m3', 'sec', 'morning'),
      job('n1', 'kt', 'noon'), job('d1', 'hk', 'next-day'), job('g1', 'mt', null)
    ]
  },
  {
    id: 'meeting', name: 'Parents meeting', event_date: today,
    sessions: [session('untimed', today, null, null, { title: 'Setup' })],
    tasks: [job('u1', 'hk', 'untimed')]
  }
];

test("today's open jobs are counted per department, once each, across sessions and whole-event work", () => {
  assert.deepEqual(openJobsByDepartment(events, today), { hk: 2, sec: 1, kt: 1, mt: 1 });
});

test('finished jobs and other days are not counted', () => {
  assert.deepEqual(openJobsByDepartment(events, tomorrow), { hk: 1 });
  assert.deepEqual(openJobsByDepartment(events, '2026-11-06'), {});
});

test('now holds the session under way, and next the first one still to start today', () => {
  const at = Date.parse(time(today, '09:15'));
  const result = nowAndNext(events, at, today);
  assert.deepEqual(result.now.map((entry) => entry.key), ['run:morning']);
  assert.deepEqual(result.now[0].openCounts, { hk: 1, sec: 1 });
  assert.equal(result.next?.key, 'run:noon');
  assert.equal(result.next?.minutes, 165);
});

test('a session without an end time runs for two hours; untimed sessions never appear', () => {
  const at = Date.parse(time(today, '13:30'));
  const result = nowAndNext(events, at, today);
  assert.deepEqual(result.now.map((entry) => entry.key), ['run:noon']);
  assert.equal(result.next, null);
  assert.equal(nowAndNext(events, Date.parse(time(today, '14:00')), today).now.length, 0);
});

test('the session title falls back to the place', () => {
  const result = nowAndNext(events, Date.parse(time(today, '07:00')), today);
  assert.equal(result.next?.sessionTitle, 'Atrium');
  assert.equal(result.now.length, 0);
});
