import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarFeedUrl, FEED_CAMPUSES, googleCalendarAddUrl, webcalUrl } from '../src/lib/calendarFeedLinks.ts';

const KEY = '0123456789abcdef0123456789abcdef';

test('each campus has its own link with the key, and Thai adds lang=th', () => {
  assert.deepEqual(FEED_CAMPUSES, ['HSC', 'HSN']);
  assert.equal(calendarFeedUrl('https://hs-opt.netlify.app', 'HSC', KEY, 'en'), `https://hs-opt.netlify.app/calendar/hsc.ics?key=${KEY}`);
  assert.equal(calendarFeedUrl('https://hs-opt.netlify.app/', 'HSN', KEY, 'th'), `https://hs-opt.netlify.app/calendar/hsn.ics?key=${KEY}&lang=th`);
});

test('the same link opens calendar apps and Google Calendar', () => {
  const url = calendarFeedUrl('https://hs-opt.netlify.app', 'HSC', KEY, 'en');
  assert.equal(webcalUrl(url), `webcal://hs-opt.netlify.app/calendar/hsc.ics?key=${KEY}`);
  const google = new URL(googleCalendarAddUrl(url));
  assert.equal(google.origin + google.pathname, 'https://calendar.google.com/calendar/r');
  assert.equal(google.searchParams.get('cid'), webcalUrl(url), 'the link survives the trip intact');
});
