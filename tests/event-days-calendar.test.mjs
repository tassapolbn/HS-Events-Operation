import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysBetween, eventCoversDay, eventDayCount, eventDayIndex, eventDaysWithin, eventEndDate, eventOverlaps,
  isMultiDay, MAX_DAY_SESSIONS, sessionDaysForNewEvent, shiftDay, storedEndDate
} from '../src/lib/eventDays.ts';
import {
  alertsSignature, bangkokDayTime, buildCalendarDays, calendarFromBoard, prepLabel, todayTomorrowAlerts
} from '../src/lib/calendarDays.ts';

const fair = { event_date: '2026-10-28', end_date: '2026-10-31' };
const oneDay = { event_date: '2026-10-28', end_date: null };

test('day arithmetic works across months and years', () => {
  assert.equal(shiftDay('2026-10-31', 1), '2026-11-01');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-28', '2026-11-02'), 5);
});

test('an event runs from its first to its last day', () => {
  assert.equal(eventEndDate(fair), '2026-10-31');
  assert.equal(eventEndDate(oneDay), '2026-10-28');
  assert.equal(eventEndDate({ event_date: '2026-10-28', end_date: '2026-10-20' }), '2026-10-28', 'an end before the start is ignored');
  assert.equal(eventDayCount(fair), 4);
  assert.equal(isMultiDay(fair), true);
  assert.equal(isMultiDay(oneDay), false);
  assert.equal(eventCoversDay(fair, '2026-10-30'), true);
  assert.equal(eventCoversDay(fair, '2026-11-01'), false);
  assert.equal(eventDayIndex(fair, '2026-10-30'), 3);
  assert.equal(eventOverlaps(fair, '2026-10-30', '2026-11-05'), true, 'still running when the week starts');
  assert.equal(eventOverlaps(fair, '2026-11-01', '2026-11-05'), false);
  assert.deepEqual(eventDaysWithin(fair, '2026-10-30', '2026-11-30'), ['2026-10-30', '2026-10-31']);
});

test('a one-day event stores no end date; a new event gets a session per day', () => {
  assert.equal(storedEndDate('2026-10-28', '2026-10-28'), null);
  assert.equal(storedEndDate('2026-10-28', ''), null);
  assert.equal(storedEndDate('2026-10-28', '2026-10-30'), '2026-10-30');
  assert.deepEqual(sessionDaysForNewEvent(fair), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  assert.deepEqual(sessionDaysForNewEvent(oneDay), ['2026-10-28']);
  const long = { event_date: '2026-10-01', end_date: shiftDay('2026-10-01', MAX_DAY_SESSIONS) };
  assert.deepEqual(sessionDaysForNewEvent(long), ['2026-10-01'], 'a very long event gets only its first-day session');
});

test('times are read in Bangkok', () => {
  assert.deepEqual(bangkokDayTime('2026-10-27T02:00:00Z'), { day: '2026-10-27', time: '09:00' });
  assert.deepEqual(bangkokDayTime('2026-10-27T18:30:00Z'), { day: '2026-10-28', time: '01:30' }, 'after 17:00 UTC it is the next day');
  assert.equal(bangkokDayTime(null), null);
  assert.equal(bangkokDayTime('not a date'), null);
});

const event = (over) => ({ id: 'e1', name: 'Sports Day', status: 'scheduled', event_date: '2026-10-28', end_date: '2026-10-30', ...over });
const session = (over) => ({ id: 's', event_id: 'e1', title: '', session_date: '2026-10-28', start_time: null, end_time: null, sort_order: 0, ...over });

test('a multi-day event is on every one of its days, numbered', () => {
  const days = buildCalendarDays([event({})], [], '2026-10-26', '2026-11-01');
  assert.deepEqual([...days.keys()].sort(), ['2026-10-28', '2026-10-29', '2026-10-30']);
  const second = days.get('2026-10-29')[0];
  assert.equal(second.kind, 'event');
  assert.equal(second.dayIndex, 2);
  assert.equal(second.dayCount, 3);
});

test('an event that started before the view still shows on its remaining days', () => {
  const days = buildCalendarDays([event({})], [], '2026-10-29', '2026-10-29');
  assert.equal(days.get('2026-10-29')[0].dayIndex, 2);
});

test('sessions within the event sit inside that day\'s entry, earliest first', () => {
  const days = buildCalendarDays(
    [event({ end_date: null })],
    [
      session({ id: 'late', title: 'Prize giving', start_time: '2026-10-28T08:00:00Z' }),
      session({ id: 'early', title: 'Races', start_time: '2026-10-28T01:00:00Z' })
    ],
    '2026-10-26', '2026-11-01'
  );
  const entry = days.get('2026-10-28')[0];
  assert.equal(entry.kind, 'event');
  assert.deepEqual(entry.sessions.map((s) => s.id), ['early', 'late']);
  assert.equal(entry.time, '08:00');
  assert.equal(days.size, 1, 'no extra entries');
});

test('a setup session the day before shows on that day as prep work', () => {
  const days = buildCalendarDays(
    [event({ end_date: null })],
    [session({ id: 'setup', title: 'Setup', session_date: '2026-10-27', start_time: '2026-10-27T07:00:00Z' })],
    '2026-10-26', '2026-11-01'
  );
  const prep = days.get('2026-10-27')[0];
  assert.equal(prep.kind, 'prep');
  assert.equal(prep.sessions[0].title, 'Setup');
  assert.equal(prep.time, '14:00');
  assert.equal(days.get('2026-10-28')[0].kind, 'event');
});

test('"Setup begins" on an earlier day shows even without a session', () => {
  const days = buildCalendarDays([event({ end_date: null, setup_start: '2026-10-27T09:00:00Z' })], [], '2026-10-26', '2026-11-01');
  const prep = days.get('2026-10-27')[0];
  assert.equal(prep.kind, 'prep');
  assert.equal(prep.setupTime, '16:00');
  assert.deepEqual(prep.sessions, []);
});

test('a setup session and "Setup begins" on the same day make one entry, not two', () => {
  const days = buildCalendarDays(
    [event({ end_date: null, setup_start: '2026-10-27T09:00:00Z' })],
    [session({ id: 'setup', title: 'Setup', session_date: '2026-10-27' })],
    '2026-10-26', '2026-11-01'
  );
  assert.equal(days.get('2026-10-27').length, 1);
  assert.equal(days.get('2026-10-27')[0].setupTime, null, 'the session speaks for the day');
});

test('"Setup begins" on the event day itself adds nothing extra', () => {
  const days = buildCalendarDays([event({ end_date: null, setup_start: '2026-10-28T00:00:00Z' })], [], '2026-10-26', '2026-11-01');
  assert.deepEqual([...days.keys()], ['2026-10-28']);
});

test('only days in view are filled; a setup day just before the view is not', () => {
  const days = buildCalendarDays(
    [event({})],
    [session({ id: 'setup', session_date: '2026-10-27' })],
    '2026-10-28', '2026-10-28'
  );
  assert.deepEqual([...days.keys()], ['2026-10-28']);
});

test('a day lists entries in time order, untimed last', () => {
  const days = buildCalendarDays(
    [
      { id: 'a', name: 'Assembly', status: 'scheduled', event_date: '2026-10-28', event_start: '2026-10-28T03:00:00Z' },
      { id: 'b', name: 'Breakfast', status: 'scheduled', event_date: '2026-10-28', event_start: '2026-10-28T00:30:00Z' },
      { id: 'c', name: 'Cleanup', status: 'scheduled', event_date: '2026-10-28' }
    ],
    [],
    '2026-10-28', '2026-10-28'
  );
  assert.deepEqual(days.get('2026-10-28').map((entry) => entry.event.id), ['b', 'a', 'c']);
});

test('sessions of events not in the list are ignored', () => {
  const days = buildCalendarDays([], [session({ event_id: 'unknown' })], '2026-10-26', '2026-11-01');
  assert.equal(days.size, 0);
});

const words = { setupBegins: 'Setup begins', before: 'Preparation', after: 'After the event', session: 'Session' };

test('a prep day knows whether it is before or after the event, and says so when its session has no name', () => {
  const sessions = [
    session({ id: 'setup', session_date: '2026-10-27', title: '' }),
    session({ id: 'pack', session_date: '2026-10-31', title: '' })
  ];
  const days = buildCalendarDays([event({})], sessions, '2026-10-26', '2026-11-01');
  const before = days.get('2026-10-27')[0];
  const after = days.get('2026-10-31')[0];
  assert.equal(before.when, 'before');
  assert.equal(after.when, 'after');
  assert.equal(prepLabel(before, words), 'Preparation');
  assert.equal(prepLabel(after, words), 'After the event');

  // After a one-day event, an untitled session may be a later day of it, so it stays neutral
  const single = buildCalendarDays([event({ end_date: null })], [session({ id: 'x', session_date: '2026-10-29' })], '2026-10-26', '2026-11-01');
  assert.equal(prepLabel(single.get('2026-10-29')[0], words), 'Session');
});

test('a named session gives the prep day its name; "Setup begins" when only the setup time puts it there', () => {
  const named = buildCalendarDays(
    [event({})],
    [session({ id: 'a', session_date: '2026-10-27', title: 'Setup' }), session({ id: 'b', session_date: '2026-10-27', title: 'Sound check' })],
    '2026-10-26', '2026-11-01'
  );
  assert.equal(prepLabel(named.get('2026-10-27')[0], words), 'Setup +1');

  const setupOnly = buildCalendarDays([event({ setup_start: '2026-10-27T06:00:00Z' })], [], '2026-10-26', '2026-11-01');
  assert.equal(prepLabel(setupOnly.get('2026-10-27')[0], words), 'Setup begins');
  assert.equal(prepLabel(setupOnly.get('2026-10-28')[0], words), '', 'an event day is not a prep day');
});

test('the alert bar lists today and tomorrow, and leaves out drafts, archived events and empty days', () => {
  const events = [
    { id: 'photo', name: 'Yearbook Photoshoot', status: 'scheduled', event_date: '2026-10-17', end_date: null },
    { id: 'wai', name: 'Wai Khru', status: 'scheduled', event_date: '2026-10-19', end_date: null },
    { id: 'draft', name: 'Maybe Fair', status: 'draft', event_date: '2026-10-17', end_date: null },
    { id: 'old', name: 'Filed Away', status: 'archived', event_date: '2026-10-18', end_date: null }
  ];
  const sessions = [
    { id: 'wai-setup', event_id: 'wai', title: 'Setup', session_date: '2026-10-18', start_time: '2026-10-18T06:00:00Z', end_time: null }
  ];
  const alerts = todayTomorrowAlerts(events, sessions, '2026-10-17');
  assert.deepEqual(alerts.map((alert) => [alert.offset, alert.day]), [[0, '2026-10-17'], [1, '2026-10-18']]);
  assert.deepEqual(alerts[0].entries.map((entry) => entry.event.name), ['Yearbook Photoshoot']);
  const tomorrow = alerts[1].entries;
  assert.equal(tomorrow.length, 1);
  assert.equal(tomorrow[0].kind, 'prep');
  assert.equal(tomorrow[0].event.name, 'Wai Khru');
  assert.equal(tomorrow[0].time, '13:00');
  assert.equal(prepLabel(tomorrow[0], words), 'Setup');

  assert.deepEqual(todayTomorrowAlerts(events, [], '2026-10-20'), [], 'nothing on either day');
  const onlyTomorrow = todayTomorrowAlerts(events, [], '2026-10-18');
  assert.deepEqual(onlyTomorrow.map((alert) => alert.offset), [1], 'a quiet today is left out');
});

test('a multi-day event is on the alert bar every day it runs', () => {
  const fairEvent = { id: 'fair', name: 'Book Fair', status: 'active', event_date: '2026-10-16', end_date: '2026-10-18' };
  const alerts = todayTomorrowAlerts([fairEvent], [], '2026-10-17');
  assert.deepEqual(alerts.map((alert) => [alert.entries[0].dayIndex, alert.entries[0].dayCount]), [[2, 3], [3, 3]]);
});

test('hiding the bar lasts until the day or what it lists changes', () => {
  const events = [{ id: 'photo', name: 'Yearbook Photoshoot', status: 'scheduled', event_date: '2026-10-18', end_date: null }];
  const first = alertsSignature('2026-10-17', todayTomorrowAlerts(events, [], '2026-10-17'));
  assert.equal(first, alertsSignature('2026-10-17', todayTomorrowAlerts(events, [], '2026-10-17')));
  // The same event moves from tomorrow to today: a new day, so the bar comes back
  assert.notEqual(first, alertsSignature('2026-10-18', todayTomorrowAlerts(events, [], '2026-10-18')));
  const more = [...events, { id: 'wai', name: 'Wai Khru', status: 'scheduled', event_date: '2026-10-17', end_date: null }];
  assert.notEqual(first, alertsSignature('2026-10-17', todayTomorrowAlerts(more, [], '2026-10-17')));
});

test('the board\'s events read the same way as the calendar\'s', () => {
  const board = [{
    id: 'wai', name: 'Wai Khru', status: 'scheduled', campus: 'HSC', event_date: '2026-10-19', end_date: null,
    location: 'Hall', header_color: '#123456', event_start: null, event_finish: null, setup_start: null,
    sessions: [{ id: 's1', title: 'Setup', session_date: '2026-10-18', location: 'Hall', start_time: null, end_time: null, time_note: '', note: '', sort_order: 0 }],
    tasks: [], attachments: []
  }];
  const { events, sessions } = calendarFromBoard(board);
  assert.equal(events[0].end_date, null);
  assert.deepEqual(sessions, [{ id: 's1', event_id: 'wai', title: 'Setup', session_date: '2026-10-18', start_time: null, end_time: null, location: 'Hall', sort_order: 0 }]);
  const alerts = todayTomorrowAlerts(events, sessions, '2026-10-17');
  assert.equal(alerts[0].offset, 1);
  assert.equal(alerts[0].entries[0].kind, 'prep');
});
