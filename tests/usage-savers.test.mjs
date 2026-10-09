import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_MS, RETRY_MS, fetchLiveBuild, parseAttempt, shouldReload } from '../src/lib/appVersion.ts';
import { KEEP_RATIO, MAX_SIDE, MIN_BYTES, fitWithin, isShrinkable, renameForType } from '../src/lib/imageShrink.ts';

const NOW = 10_000_000_000;
const idle = NOW - IDLE_MS - 1;

test('a board reloads only for a different live release, when idle and not editing', () => {
  const base = { running: 'abc', lastAttempt: null, lastInteraction: idle, now: NOW };
  assert.equal(shouldReload({ ...base, live: 'def' }), true);
  assert.equal(shouldReload({ ...base, live: 'abc' }), false, 'same release');
  assert.equal(shouldReload({ ...base, live: null }), false, 'version file unreadable');
  assert.equal(shouldReload({ ...base, live: 'def', busy: true }), false, 'editor open');
  assert.equal(shouldReload({ ...base, live: 'def', lastInteraction: NOW - 30_000 }), false, 'touched 30 seconds ago');
});

test('a board does not reload over and over for the same release', () => {
  const base = { running: 'abc', live: 'def', lastInteraction: idle, now: NOW };
  assert.equal(shouldReload({ ...base, lastAttempt: { build: 'def', at: NOW - 60_000 } }), false, 'just tried');
  assert.equal(shouldReload({ ...base, lastAttempt: { build: 'def', at: NOW - RETRY_MS - 1 } }), true, 'tried long ago');
  assert.equal(shouldReload({ ...base, lastAttempt: { build: 'xyz', at: NOW - 60_000 } }), true, 'tried for another release');
});

test('saved reload attempts are read safely', () => {
  assert.deepEqual(parseAttempt('{"build":"def","at":5}'), { build: 'def', at: 5 });
  assert.equal(parseAttempt(null), null);
  assert.equal(parseAttempt('not json'), null);
  assert.equal(parseAttempt('{"build":7}'), null);
});

test('the live build id is read from version.json, and anything odd means unknown', async () => {
  const answer = (status, body) => async (url, init) => {
    assert.match(String(url), /^\/version\.json\?t=\d+$/);
    assert.equal(init.cache, 'no-store');
    return { ok: status === 200, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) };
  };
  assert.equal(await fetchLiveBuild(answer(200, { build: 'def' })), 'def');
  assert.equal(await fetchLiveBuild(answer(404, { build: 'def' })), null);
  assert.equal(await fetchLiveBuild(answer(200, '<!doctype html>')), null, 'older release answers with the app page');
  assert.equal(await fetchLiveBuild(answer(200, { build: '' })), null);
  assert.equal(await fetchLiveBuild(async () => { throw new Error('offline'); }), null);
});

test('only big photos and screenshots are shrunk', () => {
  assert.equal(isShrinkable('image/jpeg', 3_000_000), true);
  assert.equal(isShrinkable('image/PNG', MIN_BYTES), true);
  assert.equal(isShrinkable('image/heic', 2_000_000), true);
  assert.equal(isShrinkable('image/jpeg', MIN_BYTES - 1), false, 'already small');
  assert.equal(isShrinkable('image/gif', 3_000_000), false, 'may be animated');
  assert.equal(isShrinkable('image/svg+xml', 3_000_000), false);
  assert.equal(isShrinkable('application/pdf', 3_000_000), false);
  assert.ok(KEEP_RATIO < 1);
});

test('pictures are scaled down to fit, never up', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: MAX_SIDE, height: 2250 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 2250, height: MAX_SIDE });
  assert.deepEqual(fitWithin(6058, 1515), { width: MAX_SIDE, height: 750 });
  assert.deepEqual(fitWithin(1200, 800), { width: 1200, height: 800 });
  assert.deepEqual(fitWithin(0, 0), { width: 1, height: 1 });
});

test('a shrunk file gets the extension of its new format', () => {
  assert.equal(renameForType('IMG_1234.HEIC', 'image/webp'), 'IMG_1234.webp');
  assert.equal(renameForType('Floor plan (1).png', 'image/jpeg'), 'Floor plan (1).jpg');
  assert.equal(renameForType('photo', 'image/webp'), 'photo.webp');
  assert.equal(renameForType('my.event.photo.jpeg', 'image/webp'), 'my.event.photo.webp');
  assert.equal(renameForType('scan.png', 'image/png'), 'scan.png', 'unchanged format keeps its name');
});
