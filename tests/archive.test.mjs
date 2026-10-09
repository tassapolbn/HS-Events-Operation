import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  schoolDay, schoolToday, eventLastDay, eventArchiveReason, requestLastDay, requestArchiveReason,
  restoreStatus, groupByRestoreStatus
} from '../src/lib/archive.ts';

test('school days follow Bangkok, not UTC or the device', () => {
  // 18:30 UTC on 8 Oct is already 01:30 on 9 Oct in Phuket
  assert.equal(schoolToday(Date.parse('2026-10-08T18:30:00Z')), '2026-10-09');
  assert.equal(schoolToday(Date.parse('2026-10-08T16:59:59Z')), '2026-10-08');
  assert.equal(schoolDay('2026-10-08T17:00:00Z'), '2026-10-09');
  assert.equal(schoolDay('2026-10-08'), '2026-10-08');
  assert.equal(schoolDay('not a date'), '');
});

test('an event is archivable once completed or once its last day has passed', () => {
  const today = '2026-10-09';
  assert.equal(eventArchiveReason({ status: 'completed', event_date: '2026-12-01' }, today), 'completed');
  assert.equal(eventArchiveReason({ status: 'active', event_date: '2026-10-08' }, today), 'past');
  assert.equal(eventArchiveReason({ status: 'draft', event_date: '2026-09-01' }, today), 'past');
  assert.equal(eventArchiveReason({ status: 'scheduled', event_date: '2026-10-09' }, today), null, 'today is not past');
  assert.equal(eventArchiveReason({ status: 'active', event_date: '2026-10-20' }, today), null);
  assert.equal(eventArchiveReason({ status: 'archived', event_date: '2026-01-01' }, today), null, 'already archived');
});

test('a multi-day event stays live until its last session day', () => {
  const event = {
    status: 'active', event_date: '2026-10-01',
    event_sessions: [{ session_date: '2026-10-01' }, { session_date: '2026-10-11' }, { session_date: '2026-10-05' }]
  };
  assert.equal(eventLastDay(event), '2026-10-11');
  assert.equal(eventArchiveReason(event, '2026-10-09'), null);
  assert.equal(eventArchiveReason(event, '2026-10-12'), 'past');
  assert.equal(eventLastDay({ status: 'active', event_date: '2026-10-01', event_sessions: null }), '2026-10-01');
});

test('a request is archivable once completed, cancelled or past its last scheduled day', () => {
  const base = { request_date: '2026-10-01', due_date: null, due_at: null, setup_datetime: null, teardown_datetime: null };
  const today = '2026-10-09';
  assert.equal(requestArchiveReason({ ...base, status: 'completed', due_date: '2026-12-01' }, today), 'completed');
  assert.equal(requestArchiveReason({ ...base, status: 'cancelled' }, today), 'cancelled');
  assert.equal(requestArchiveReason({ ...base, status: 'new', due_date: '2026-10-08' }, today), 'past', 'overdue');
  assert.equal(requestArchiveReason({ ...base, status: 'in_progress', due_date: '2026-10-09' }, today), null, 'due today');
  assert.equal(requestArchiveReason({ ...base, status: 'new', due_date: '2026-10-30' }, today), null);
  assert.equal(requestArchiveReason({ ...base, status: 'new' }, today), 'past', 'no dates: falls back to the request date');
  assert.equal(requestArchiveReason({ ...base, status: 'completed', archived_at: '2026-10-09T01:00:00Z' }, today), null);
});

test("a request's last day is the latest of deadline, setup and teardown, in Bangkok", () => {
  const base = { status: 'new', request_date: '2026-09-01', due_date: null, due_at: null, setup_datetime: null, teardown_datetime: null };
  // A 03:00 deadline in Phuket is still the previous evening in UTC
  assert.equal(requestLastDay({ ...base, due_at: '2026-10-08T20:00:00Z', due_date: '2026-10-09' }), '2026-10-09');
  assert.equal(requestLastDay({ ...base, due_date: '2026-10-09', teardown_datetime: '2026-10-12T09:00:00Z' }), '2026-10-12');
  assert.equal(requestLastDay({ ...base, setup_datetime: '2026-10-03T02:00:00Z' }), '2026-10-03');
  assert.equal(requestLastDay(base), '2026-09-01');
  // Setup later than an earlier deadline keeps the request live until the setup day
  assert.equal(requestArchiveReason({ ...base, due_date: '2026-10-05', setup_datetime: '2026-10-10T01:00:00Z' }, '2026-10-09'), null);
});

test('restored events go back to the status they had, or completed when unknown', () => {
  assert.equal(restoreStatus({ status_before_archive: 'active' }), 'active');
  assert.equal(restoreStatus({ status_before_archive: 'draft' }), 'draft');
  assert.equal(restoreStatus({ status_before_archive: null }), 'completed');
  assert.equal(restoreStatus({}), 'completed');
  assert.equal(restoreStatus({ status_before_archive: 'archived' }), 'completed');
  const groups = groupByRestoreStatus([
    { id: 'a', status_before_archive: 'active' },
    { id: 'b', status_before_archive: null },
    { id: 'c', status_before_archive: 'active' },
    { id: 'd', status_before_archive: 'scheduled' }
  ]);
  assert.deepEqual(Object.fromEntries(groups), { active: ['a', 'c'], completed: ['b'], scheduled: ['d'] });
});
