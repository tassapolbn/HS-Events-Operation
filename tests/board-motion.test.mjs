import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedTaskIds, sessionLiveState } from '../src/lib/boardMotion.ts';

const task = (id, title, extra = {}) => ({
  id, title, description: '', notes: '', assigned_staff: '', session_id: 's1', department_id: 'hk', status: 'not_started', ...extra
});

test('the first load marks nothing as changed but remembers every job', () => {
  const { next, changed } = changedTaskIds(null, [{ tasks: [task('a', 'ยกเก้าอี้'), task('b', 'คลุมผ้า')] }]);
  assert.equal(changed.size, 0);
  assert.deepEqual([...next.keys()], ['a', 'b']);
});

test('new jobs and edited jobs glow; untouched ones do not', () => {
  const first = changedTaskIds(null, [{ tasks: [task('a', 'ยกเก้าอี้'), task('b', 'คลุมผ้า')] }]).next;
  const { changed } = changedTaskIds(first, [{ tasks: [task('a', 'ยกเก้าอี้ 20 ตัว'), task('b', 'คลุมผ้า'), task('c', 'จัดดอกไม้')] }]);
  assert.deepEqual([...changed].sort(), ['a', 'c']);
});

test('ticking a job, or any status change, is not a content change', () => {
  const first = changedTaskIds(null, [{ tasks: [task('a', 'ยกเก้าอี้')] }]).next;
  const { changed } = changedTaskIds(first, [{ tasks: [task('a', 'ยกเก้าอี้', { status: 'completed' })] }]);
  assert.equal(changed.size, 0);
});

test('a moved job counts as changed, and a pipe in a title cannot fake a match', () => {
  const first = changedTaskIds(null, [{ tasks: [task('a', 'x|y', { notes: 'z' })] }]).next;
  assert.equal(changedTaskIds(first, [{ tasks: [task('a', 'x|y', { notes: 'z', department_id: 'sec' })] }]).changed.has('a'), true);
  assert.equal(changedTaskIds(first, [{ tasks: [task('a', 'x', { notes: 'y|z' })] }]).changed.has('a'), true);
});

const at = (hhmm) => Date.parse(`2026-11-04T${hhmm}:00+07:00`);
const session = (start, end = null) => ({
  start_time: start ? `2026-11-04T${start}:00+07:00` : null,
  end_time: end ? `2026-11-04T${end}:00+07:00` : null
});

test('a session is live from its start until its end', () => {
  assert.deepEqual(sessionLiveState(session('09:00', '10:00'), at('09:00')), { kind: 'live' });
  assert.deepEqual(sessionLiveState(session('09:00', '10:00'), at('09:59')), { kind: 'live' });
  assert.equal(sessionLiveState(session('09:00', '10:00'), at('10:00')), null);
});

test('without an end time a session is live for two hours', () => {
  assert.deepEqual(sessionLiveState(session('09:00'), at('10:59')), { kind: 'live' });
  assert.equal(sessionLiveState(session('09:00'), at('11:00')), null);
});

test('within half an hour of its start a session starts soon, in whole minutes rounded up', () => {
  assert.deepEqual(sessionLiveState(session('09:00'), at('08:30')), { kind: 'soon', minutes: 30 });
  assert.deepEqual(sessionLiveState(session('09:00'), at('08:59') + 30_000), { kind: 'soon', minutes: 1 });
  assert.equal(sessionLiveState(session('09:00'), at('08:29')), null);
});

test('no start time, a bad time or an end before the start means no live state', () => {
  assert.equal(sessionLiveState(session(null), at('09:00')), null);
  assert.equal(sessionLiveState({ start_time: 'not a time', end_time: null }, at('09:00')), null);
  assert.equal(sessionLiveState(session('10:00', '09:00'), at('09:30')), null);
});
