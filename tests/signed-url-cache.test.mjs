import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSignedUrlCache } from '../src/lib/signedUrlCache.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
}

function rig({ storage = memoryStorage(), start = 1_000_000 } = {}) {
  const clock = { now: start };
  const signed = [];
  const make = () =>
    createSignedUrlCache({
      sign: async (path, seconds) => {
        signed.push({ path, seconds });
        return `https://files.example/${path}?token=${signed.length}`;
      },
      storage,
      now: () => clock.now
    });
  return { cache: make(), make, clock, signed, storage };
}

test('one link is reused for six days and renewed when less than a day is left', async () => {
  const { cache, clock, signed } = rig();
  const first = await cache.get('event/a/photo.jpg');
  assert.equal(signed.length, 1);
  assert.equal(signed[0].seconds, 7 * 24 * 60 * 60, 'links last a week');

  clock.now += 6 * DAY - HOUR;
  assert.equal(await cache.get('event/a/photo.jpg'), first, 'same address, so the browser keeps the picture');
  assert.equal(signed.length, 1);

  clock.now += 2 * HOUR; // under a day left
  const renewed = await cache.get('event/a/photo.jpg');
  assert.notEqual(renewed, first);
  assert.equal(signed.length, 2);
});

test('links survive a page reload through storage', async () => {
  const { cache, make, signed } = rig();
  const first = await cache.get('event/a/plan.png');
  const afterReload = make();
  assert.equal(await afterReload.get('event/a/plan.png'), first);
  assert.equal(signed.length, 1);
});

test('two tiles showing the same photo share one signing request', async () => {
  const { cache, signed } = rig();
  const [a, b] = await Promise.all([cache.get('task/x.jpg'), cache.get('task/x.jpg')]);
  assert.equal(a, b);
  assert.equal(signed.length, 1);
});

test('a link that stopped working can be dropped and replaced', async () => {
  const { cache, make, signed } = rig();
  const first = await cache.get('task/y.jpg');
  cache.forget('task/y.jpg');
  const second = await cache.get('task/y.jpg');
  assert.notEqual(second, first);
  assert.equal(signed.length, 2);
  assert.equal(await make().get('task/y.jpg'), second, 'storage holds the replacement');
});

test('expired links are pruned from storage', async () => {
  const { cache, clock, storage } = rig();
  await cache.get('old.jpg');
  clock.now += 8 * DAY;
  await cache.get('new.jpg');
  const saved = JSON.parse(storage.map.get('eventops.signedUrls.v1'));
  assert.deepEqual(Object.keys(saved), ['new.jpg']);
});

test('blocked or corrupt storage falls back to memory without breaking', async () => {
  const blocked = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceeded'); }
  };
  const { cache, signed } = rig({ storage: blocked });
  const a = await cache.get('p.jpg');
  assert.equal(await cache.get('p.jpg'), a);
  assert.equal(signed.length, 1);

  const corrupt = memoryStorage();
  corrupt.setItem('eventops.signedUrls.v1', '{not json');
  const second = rig({ storage: corrupt });
  assert.ok((await second.cache.get('p.jpg')).startsWith('https://'));
});

test('a failed signing request is not cached', async () => {
  let fail = true;
  let calls = 0;
  const cache = createSignedUrlCache({
    sign: async (path) => {
      calls += 1;
      if (fail) throw new Error('network');
      return `https://files.example/${path}?token=${calls}`;
    },
    storage: null
  });
  await assert.rejects(cache.get('z.jpg'));
  fail = false;
  assert.ok((await cache.get('z.jpg')).includes('token=2'));
});
