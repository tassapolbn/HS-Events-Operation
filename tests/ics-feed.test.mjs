import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcsFeed, eventEntries, foldLine, icsDate, icsDateTime, icsEscape } from '../src/lib/icsFeed.ts';

const site = 'https://hs-opt.netlify.app';
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00+07:00`).toISOString();

const waiKru = {
  id: 'wai',
  name: 'Wai Kru',
  campus: 'HSC',
  status: 'scheduled',
  event_date: '2026-10-21',
  end_date: '2026-10-23',
  location: 'Hall',
  updated_at: '2026-10-10T03:00:00Z',
  contacts: [{ name: 'Khun Malee', role: 'Lead', phone: '081 234 5678', email: '' }, { name: '  ' }],
  sessions: [
    { id: 's-setup', title: 'Setup', session_date: '2026-10-19', start_time: at('2026-10-19', '14:00'), end_time: at('2026-10-19', '17:00'), location: 'Atrium', time_note: 'after school', note: 'Bring 20 tables' },
    { id: 's-sec', title: 'Secondary ceremony', session_date: '2026-10-21', start_time: at('2026-10-21', '08:30'), end_time: null, location: '' },
    { id: 's-pri', title: '', session_date: '2026-10-22', start_time: null, end_time: null, location: '' },
    { id: 's-odd', title: 'Odd times', session_date: '2026-10-23', start_time: at('2026-10-23', '10:00'), end_time: at('2026-10-23', '09:00') }
  ]
};

/** The calendar as a list of entries, each a map of property name to value */
function parse(ics) {
  const unfolded = ics.replace(/\r\n /g, '');
  const entries = [];
  let current = null;
  for (const line of unfolded.split('\r\n')) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') { entries.push(current); current = null; }
    else if (current) {
      const colon = line.indexOf(':');
      current[line.slice(0, colon)] = line.slice(colon + 1);
    }
  }
  return entries;
}

test('text values are escaped as iCalendar asks', () => {
  assert.equal(icsEscape('Tables, chairs; and a \\ backslash\nnext line'), 'Tables\\, chairs\\; and a \\\\ backslash\\nnext line');
  assert.equal(icsEscape('a\r\nb\u0007c'), 'a\\nbc', 'CRLF becomes \\n and control characters go');
});

test('long lines fold at 75 bytes without breaking a Thai character', () => {
  const thai = 'SUMMARY:' + 'งานไหว้ครูประจำปีการศึกษา '.repeat(8);
  const folded = foldLine(thai);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  for (const line of lines) {
    const bytes = new TextEncoder().encode(line);
    assert.ok(bytes.length <= 75, `a line of ${bytes.length} bytes`);
    assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes), 'every line is valid UTF-8 on its own');
  }
  assert.equal(folded.replace(/\r\n /g, ''), thai, 'unfolding gives back the original');
  assert.equal(foldLine('SHORT:line'), 'SHORT:line');
});

test('dates and times in iCalendar form', () => {
  assert.equal(icsDate('2026-10-21'), '20261021');
  assert.equal(icsDateTime(at('2026-10-19', '14:00')), '20261019T070000Z', '14:00 in Bangkok is 07:00 UTC');
  assert.equal(icsDateTime(null), null);
  assert.equal(icsDateTime('not a time'), null);
});

test('an event is one all-day entry across its days, and each session is its own entry', () => {
  const ics = buildIcsFeed({ events: [waiKru], campus: 'HSC', campusName: 'Chaofah City Campus', lang: 'en', siteUrl: site, now: new Date('2026-10-17T00:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  assert.match(ics, /X-WR-CALNAME:HeadStart Events · Chaofah City Campus/);

  const entries = parse(ics);
  assert.equal(entries.length, 5, 'the event and its four sessions');
  const event = entries.find((entry) => entry.UID === 'event-wai@hs-event-ops');
  assert.equal(event['DTSTART;VALUE=DATE'], '20261021');
  assert.equal(event['DTEND;VALUE=DATE'], '20261024', 'the end of an all-day entry is the day after its last day');
  assert.equal(event.SUMMARY, 'Wai Kru');
  assert.equal(event.LOCATION, 'Hall');
  assert.equal(event.URL, `${site}/display/hsc?event=wai`);
  assert.equal(event['LAST-MODIFIED'], '20261010T030000Z');
  assert.equal(event.TRANSP, 'TRANSPARENT');
  assert.match(event.DESCRIPTION, /^Wed 21 Oct – Fri 23 Oct 2026/);
  assert.match(event.DESCRIPTION, /Fri 23 Oct 10:00 Odd times/, 'a finish before the start is left out of the list too');
  assert.match(event.DESCRIPTION, /Khun Malee \(Lead\) · 081 234 5678/);
  assert.ok(!event.DESCRIPTION.includes('•   '), 'a contact without a name is left out');

  const setup = entries.find((entry) => entry.UID === 'session-s-setup@hs-event-ops');
  assert.equal(setup.SUMMARY, 'Setup · Wai Kru', 'a named session leads with its name, as on the app calendar');
  assert.equal(setup.DTSTART, '20261019T070000Z');
  assert.equal(setup.DTEND, '20261019T100000Z');
  assert.equal(setup.LOCATION, 'Atrium');
  assert.match(setup.DESCRIPTION, /^Before the event · the event starts Wed 21 Oct\\nafter school\\nNote: Bring 20 tables/);

  const secondary = entries.find((entry) => entry.UID === 'session-s-sec@hs-event-ops');
  assert.equal(secondary.DTSTART, '20261021T013000Z');
  assert.equal(secondary.DTEND, undefined, 'no finish time, no end');
  assert.equal(secondary.LOCATION, 'Hall', 'a session without a place takes the event\'s');
  assert.match(secondary.DESCRIPTION, /^Day 1 of 3/);

  const untimed = entries.find((entry) => entry.UID === 'session-s-pri@hs-event-ops');
  assert.equal(untimed.SUMMARY, 'Wai Kru', 'an unnamed session on the event\'s own days is the event');
  assert.equal(untimed['DTSTART;VALUE=DATE'], '20261022');
  assert.equal(untimed['DTEND;VALUE=DATE'], '20261023');
  assert.match(untimed.DESCRIPTION, /^Day 2 of 3/);

  const odd = entries.find((entry) => entry.UID === 'session-s-odd@hs-event-ops');
  assert.equal(odd.DTEND, undefined, 'a finish before the start is ignored');
});

test('"Setup begins" gets an entry only on an earlier day without a session', () => {
  const options = { campus: 'HSC', campusName: 'Chaofah City Campus', lang: 'en', siteUrl: site };
  const open = { id: 'open', name: 'Open House', campus: 'HSC', event_date: '2026-10-25', end_date: null, setup_start: at('2026-10-24', '16:00'), sessions: [] };
  const withSetup = eventEntries(open, options);
  const setup = withSetup.find((entry) => entry.uid === 'setup-open@hs-event-ops');
  assert.ok(setup, 'Setup begins the day before');
  assert.equal(setup.summary, 'Open House · Setup begins');
  assert.equal(setup.timed.start, '20261024T090000Z');

  const covered = { ...open, sessions: [{ id: 'x', title: 'Setup', session_date: '2026-10-24', start_time: null, end_time: null }] };
  assert.ok(!eventEntries(covered, options).some((entry) => entry.uid.startsWith('setup-')), 'a session that day already covers it');
  const sameDay = { ...open, setup_start: at('2026-10-25', '07:00') };
  assert.ok(!eventEntries(sameDay, options).some((entry) => entry.uid.startsWith('setup-')), 'setup on the event day adds nothing');
});

test('a one-day event: later sessions carry no day number, earlier ones say "before"', () => {
  const options = { campus: 'HSC', campusName: 'x', lang: 'en', siteUrl: site };
  const single = { id: 'one', name: 'Assembly', campus: 'HSC', event_date: '2026-10-21', end_date: null, sessions: [
    { id: 'a', title: 'Prep', session_date: '2026-10-20', start_time: null, end_time: null },
    { id: 'b', title: 'Day 2', session_date: '2026-10-22', start_time: null, end_time: null }
  ] };
  const entries = eventEntries(single, options);
  assert.match(entries.find((entry) => entry.uid === 'session-a@hs-event-ops').description[0], /^Before the event/);
  assert.equal(entries.find((entry) => entry.uid === 'session-b@hs-event-ops').description[0], '');
});

test('the Thai calendar speaks Thai', () => {
  const ics = buildIcsFeed({ events: [waiKru], campus: 'HSC', campusName: 'Chaofah City Campus', lang: 'th', siteUrl: site, now: new Date('2026-10-17T00:00:00Z') });
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /X-WR-CALNAME:งานอีเวนท์ HeadStart · Chaofah City Campus/);
  assert.match(unfolded, /SUMMARY:Setup · Wai Kru/);
  assert.match(unfolded, /DESCRIPTION:ก่อนวันงาน · งานเริ่ม/);
  assert.match(unfolded, /วันที่ 2 จาก 3/);
});

test('events come in date order and an empty campus is still a valid calendar', () => {
  const later = { ...waiKru, id: 'later', name: 'Later', event_date: '2026-11-01', end_date: null, sessions: [] };
  const ics = buildIcsFeed({ events: [later, waiKru], campus: 'HSC', campusName: 'x', lang: 'en', siteUrl: site, now: new Date() });
  assert.ok(ics.indexOf('UID:event-wai@') < ics.indexOf('UID:event-later@'));
  const empty = buildIcsFeed({ events: [], campus: 'HSN', campusName: 'Cherngtalay North Campus', lang: 'en', siteUrl: site, now: new Date() });
  assert.ok(empty.startsWith('BEGIN:VCALENDAR') && empty.endsWith('END:VCALENDAR\r\n') && !empty.includes('BEGIN:VEVENT'));
});

test('an unnamed session before the event says it is preparation, and a finish-only time is spelled out', () => {
  const options = { campus: 'HSC', campusName: 'x', lang: 'en', siteUrl: site };
  const run = { id: 'run', name: 'Child Watch Run', campus: 'HSC', event_date: '2026-11-08', end_date: null, sessions: [
    { id: 'p', title: '', session_date: '2026-10-05', start_time: null, end_time: null, note: 'Pack on 6 October' },
    { id: 'q', title: '', session_date: '2026-11-08', start_time: null, end_time: at('2026-11-08', '05:30') }
  ] };
  const entries = eventEntries(run, options);
  assert.equal(entries.find((entry) => entry.uid === 'session-p@hs-event-ops').summary, 'Preparation · Child Watch Run');
  const finishOnly = entries.find((entry) => entry.uid === 'session-q@hs-event-ops');
  assert.equal(finishOnly.summary, 'Child Watch Run');
  assert.ok(finishOnly.allDay, 'without a start it is an all-day entry');
  assert.ok(finishOnly.description.includes('Until 05:30'));

  const fair = { ...waiKru, sessions: [{ id: 'z', title: '', session_date: '2026-10-24', start_time: null, end_time: null }] };
  assert.equal(eventEntries(fair, options).find((entry) => entry.uid === 'session-z@hs-event-ops').summary, 'After the event · Wai Kru');
  const thai = eventEntries(run, { ...options, lang: 'th' });
  assert.equal(thai.find((entry) => entry.uid === 'session-p@hs-event-ops').summary, 'เตรียมงาน · Child Watch Run');
  assert.ok(thai.find((entry) => entry.uid === 'session-q@hs-event-ops').description.includes('ถึง 05:30'));
});
