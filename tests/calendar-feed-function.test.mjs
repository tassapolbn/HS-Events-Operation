import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { config } from '../netlify/functions/calendar-feed.mts';

const KEY = '0123456789abcdef0123456789abcdef';
let env;
let calls;
let answer;

beforeEach(() => {
  env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' };
  calls = [];
  answer = () => new Response(JSON.stringify([
    { id: 'wai', name: 'Wai Kru', campus: 'HSC', event_date: '2026-10-21', end_date: null, location: 'Hall', contacts: [], sessions: [] }
  ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.Netlify = { env: { get: (name) => env[name] } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return answer();
  };
});

const get = (path) => handler(new Request(`https://hs-opt.netlify.app${path}`));

test('it serves exactly the two campus addresses', () => {
  assert.deepEqual(config.path, ['/calendar/hsc.ics', '/calendar/hsn.ics']);
});

test('a good key gets the campus calendar, cached by Netlify for an hour', async () => {
  const response = await get(`/calendar/hsc.ics?key=${KEY}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.match(response.headers.get('netlify-cdn-cache-control'), /public, durable, s-maxage=3600/);
  assert.equal(response.headers.get('netlify-vary'), 'query=key|lang');
  const body = await response.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /SUMMARY:Wai Kru/);
  assert.match(body, /URL:https:\/\/hs-opt\.netlify\.app\/display\/hsc\?event=wai/);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/calendar_feed');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, 'anon-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_key: KEY, p_campus: 'HSC' });
});

test('the North campus asks for HSN, and lang=th gives the Thai calendar', async () => {
  const response = await get(`/calendar/hsn.ics?key=${KEY}&lang=th`);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_key: KEY, p_campus: 'HSN' });
  assert.match((await response.text()).replace(/\r\n /g, ''), /X-WR-CALNAME:งานอีเวนท์ HeadStart · Cherngtalay North Campus/);
});

test('a missing or malformed key is turned away without asking the database', async () => {
  for (const path of ['/calendar/hsc.ics', '/calendar/hsc.ics?key=short', `/calendar/xyz.ics?key=${KEY}`, `/calendar/hsc.ics?key=${KEY.toUpperCase()}`]) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
  }
  assert.equal(calls.length, 0);
});

test('a key the database does not know is a 404 that is never cached', async () => {
  answer = () => new Response('null', { status: 200 });
  const response = await get(`/calendar/hsc.ics?key=${KEY}`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('netlify-cdn-cache-control'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('trouble with the database or the settings says so', async () => {
  answer = () => new Response('{}', { status: 500 });
  assert.equal((await get(`/calendar/hsc.ics?key=${KEY}`)).status, 502);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await get(`/calendar/hsc.ics?key=${KEY}`)).status, 502);
  env = {};
  assert.equal((await get(`/calendar/hsc.ics?key=${KEY}`)).status, 500);
});
