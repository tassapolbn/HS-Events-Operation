import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardMatches, searchEvents, searchRequests } from '../src/lib/boardSearch.ts';
import { bangkokInput, fromBangkokInput, scheduleLabel, requestDeadline, deadlineBeforeWork } from '../src/lib/requestSchedule.ts';

const departments = [{ id: 'hk', code: 'HK', name_en: 'Housekeeping', name_th: 'แม่บ้าน' }, { id: 'it', code: 'IT', name_en: 'ICT', name_th: 'ไอที' }];
const events = [{ id: 'event', name: 'Open Day', location: 'Sports hall', sessions: [{ id: 'am', title: 'Morning', location: 'Foyer', note: 'Keep exit clear' }, { id: 'pm', title: 'Afternoon', location: 'Studio' }], tasks: [{ id: 'chairs', session_id: 'am', title: 'Arrange chairs', description: '<p>Blue seats</p>', department_id: 'hk', assigned_staff: 'Somchai' }, { id: 'sound', session_id: 'pm', title: 'Check microphone', department_id: 'it', assigned_staff: 'Pat' }] }];

test('board search combines words across fields and supports Thai, case and department codes', () => {
  assert.equal(boardMatches('  BLUE hall ', ['<p>Blue seats</p>', 'Sports hall']), true);
  assert.equal(boardMatches('blue studio', ['Blue seats', 'Sports hall']), false);
  assert.equal(boardMatches('  ', []), true);
  const requests = [{ id: 'a', title: 'Clean windows', reference: 'REQ012', department_id: 'hk', location: 'Library' }, { id: 'b', title: 'Microphone', department_id: 'it' }];
  assert.deepEqual(searchRequests(requests, 'แม่บ้าน library', departments).map(r => r.id), ['a']);
  assert.deepEqual(searchRequests(requests, 'req012 HK', departments).map(r => r.id), ['a']);
});

test('event search retains parent context and only matching tasks, without modifying cached data', () => {
  assert.deepEqual(searchEvents(events, 'Open Day', departments), events);
  const found = searchEvents(events, 'somchai hall', departments);
  assert.deepEqual(found[0].tasks.map(t => t.id), ['chairs']);
  assert.deepEqual(found[0].sessions.map(s => s.id), ['am']);
  assert.equal(searchEvents(events, 'keep exit clear', departments)[0].tasks[0].id, 'chairs');
  assert.equal(events[0].tasks.length, 2);
  assert.deepEqual(searchEvents(events, 'no matching job', departments), []);
});

test('Bangkok datetime inputs round trip correctly across UTC midnight', () => {
  assert.equal(fromBangkokInput('2026-09-17T01:15'), '2026-09-16T18:15:00.000Z');
  assert.equal(bangkokInput('2026-09-16T18:15:00Z'), '2026-09-17T01:15');
  assert.equal(fromBangkokInput(''), null);
  assert.equal(bangkokInput(null), '');
  assert.match(scheduleLabel('2026-09-16T18:15:00Z', 'en'), /17 Sept 2026.*01:15/);
});

test('legacy date-only deadlines remain date-only and expire at the end of the school day', () => {
  assert.doesNotMatch(scheduleLabel('2026-09-17', 'en'), /00:00/);
  assert.equal(requestDeadline({ due_date: '2026-09-17' }), Date.parse('2026-09-17T16:59:59.999Z'));
  assert.equal(requestDeadline({ due_date: '2026-09-17', due_at: '2026-09-17T08:30:00Z' }), Date.parse('2026-09-17T08:30:00Z'));
  assert.equal(requestDeadline({ due_date: null }), Infinity);
  assert.equal(scheduleLabel(null, 'th'), 'ยังไม่ระบุ');
});

test('deadlines before work starts are rejected, including previous days', () => {
  assert.equal(deadlineBeforeWork('2026-09-17T09:00', '2026-09-17', '08:59'), true);
  assert.equal(deadlineBeforeWork('2026-09-17T09:00', '2026-09-17', '09:00'), false);
  assert.equal(deadlineBeforeWork('2026-09-17T09:00', '2026-09-16', ''), true);
  assert.equal(deadlineBeforeWork('2026-09-17T09:00', '2026-09-17', ''), false);
});
