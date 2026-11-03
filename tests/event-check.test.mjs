import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventCheck } from '../src/lib/eventCheck.ts';

const session = (overrides = {}) => ({
  id: 's1', session_date: '2026-11-03', start_time: '2026-11-03T09:00:00+07:00',
  end_time: null, time_note: '', location: 'Hall', sort_order: 0, ...overrides
});
const task = (overrides = {}) => ({
  session_id: 's1', department_id: 'd1', status: 'not_started', acknowledged_at: null, deleted_at: null, ...overrides
});
const check = (sessions, tasks, departmentIds = ['d1', 'd2']) => eventCheck({ event_date: '2026-11-03', sessions, tasks }, departmentIds);

test('counts completed and acknowledged open jobs separately, including whole-event totals', () => {
  const result = check([session()], [
    task(), task({ status: 'completed', acknowledged_at: '2026-11-02T09:00:00Z' }),
    task({ status: 'in_progress', acknowledged_at: '2026-11-02T10:00:00Z' }),
    task({ session_id: null, department_id: 'd2', acknowledged_at: '2026-11-02T10:00:00Z' })
  ]);
  assert.deepEqual(result.totals, {
    d1: { total: 3, done: 1, acknowledged: 1 }, d2: { total: 1, done: 0, acknowledged: 1 }
  });
  assert.deepEqual(result.blocks.map(({ sessionId, date, warnings }) => ({ sessionId, date, warnings })), [
    { sessionId: 's1', date: '2026-11-03', warnings: [] },
    { sessionId: null, date: '2026-11-03', warnings: [] }
  ]);
  assert.deepEqual(result.blocks[0].counts.d2, { total: 0, done: 0, acknowledged: 0 });
  assert.deepEqual(result.blocks[1].counts.d2, { total: 1, done: 0, acknowledged: 1 });
});

test('empty and hidden sessions expose all their preparation warnings', () => {
  const { blocks } = check([session({ start_time: null, time_note: '  ', location: '  ', is_hidden: true })], []);
  assert.equal(blocks.length, 1, 'no empty whole-event block');
  assert.deepEqual(blocks[0].warnings, ['no-jobs', 'no-time', 'no-place', 'hidden']);
});

test('free-text timing or an end time is enough to avoid the no-time warning', () => {
  for (const timing of [{ time_note: 'หลังเลิกเรียน' }, { end_time: '2026-11-03T17:00:00+07:00' }]) {
    assert.deepEqual(check([session({ start_time: null, ...timing })], [task()]).blocks[0].warnings, []);
  }
});

test('hidden-session jobs stay in their session and in department totals', () => {
  const { blocks, totals } = check([session({ is_hidden: true })], [task({ status: 'completed' })]);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].warnings, ['hidden']);
  assert.deepEqual(totals.d1, { total: 1, done: 1, acknowledged: 0 });
});

test('deleted jobs are excluded; dangling session jobs join the whole-event block', () => {
  const { blocks, totals } = check([session()], [task({ deleted_at: '2026-11-01' }), task({ session_id: 'removed-session' })]);
  assert.deepEqual(blocks[0].warnings, ['no-jobs']);
  assert.equal(blocks[1].sessionId, null);
  assert.equal(blocks[1].counts.d1.total, 1);
  assert.equal(totals.d1.total, 1);
});

test('sessions are sorted by date and sort order without changing the inputs', () => {
  const sessions = [session({ id: 'later', session_date: '2026-11-04' }), session({ id: 'second', sort_order: 2 }), session()];
  const before = structuredClone(sessions);
  const result = check(sessions, []);
  assert.deepEqual(result.blocks.map((block) => block.sessionId), ['s1', 'second', 'later']);
  assert.deepEqual(sessions, before);
  assert.equal(new Set(result.blocks.map((block) => block.key)).size, 3);
});

test('empty events and empty department lists are supported', () => {
  assert.deepEqual(check([], [], []), { blocks: [], totals: {} });
  assert.deepEqual(check([], []).totals, { d1: { total: 0, done: 0, acknowledged: 0 }, d2: { total: 0, done: 0, acknowledged: 0 } });
  const result = check([session()], [task()], []);
  assert.deepEqual(result.blocks[0].warnings, []);
});
