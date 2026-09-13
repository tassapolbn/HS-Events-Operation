import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionTimeline } from '../src/lib/sessionTimeline.ts';

const session = (id, date, time, sort_order = 0) => ({ id, session_date: date, start_time: time, sort_order });
const events = [
  { id: 'a', name: 'A', event_date: '2026-09-12', tasks: [{ id: 'general', department_id: 'hk' }], sessions: [session('late', '2026-09-14', '2026-09-14T13:00:00+07:00'), session('early', '2026-09-14', '2026-09-14T02:00:00Z'), session('next', '2026-09-15', null)] },
  { id: 'b', name: 'B', event_date: '2026-09-14', tasks: [{ id: 'b-task', session_id: 'middle', department_id: 'security' }], sessions: [session('middle', '2026-09-14', '2026-09-14T04:00:00Z')] }
];
test('sessions interleave across events by day and time, including past and empty sessions', () => {
  assert.deepEqual(sessionTimeline(events).map(entry => entry.block.key), ['a-general', 'early', 'middle', 'late', 'next']);
  assert.equal(sessionTimeline(events)[0].date, '2026-09-12');
});
test('department filter retains only its own tasks and sessions', () => {
  assert.deepEqual(sessionTimeline(events, 'security').map(entry => entry.block.key), ['middle']);
  assert.deepEqual(sessionTimeline(events, 'hk').map(entry => entry.block.key), ['a-general']);
  assert.deepEqual(sessionTimeline(events, 'unknown'), []);
});
