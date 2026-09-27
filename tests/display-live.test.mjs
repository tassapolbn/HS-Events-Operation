import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDisplayLive } from '../src/lib/displayLive.ts';

// Lets awaited signal reads settle while the mocked clock stands still
const settle = () => new Promise((resolve) => setImmediate(resolve));

function rig(t, { campus = 'HSC' } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  const state = {
    hidden: false,
    fail: false,
    day: '2026-09-27',
    reads: 0,
    rows: [
      { campus: 'HSC', board: 'events', version: 1 },
      { campus: 'HSC', board: 'requests', version: 1 }
    ]
  };
  const calls = [];
  const statuses = [];
  const live = createDisplayLive({
    campus,
    reload: (board) => calls.push(board),
    reloadAll: () => calls.push('all'),
    fetchSignals: async () => {
      state.reads += 1;
      if (state.fail) throw new Error('offline');
      return state.rows.map((row) => ({ ...row }));
    },
    isHidden: () => state.hidden,
    today: () => state.day,
    onStatus: (status) => statuses.push(status)
  });
  const bump = (board, version) => {
    state.rows = state.rows.map((row) => (row.board === board ? { ...row, version } : row));
  };
  return { live, state, calls, statuses, bump, tick: (ms) => t.mock.timers.tick(ms) };
}

test('a change reloads only its own board, once, after a short quiet spell', async (t) => {
  const { live, calls, tick } = rig(t);
  live.start();
  await settle();
  assert.deepEqual(calls, [], 'loading the starting numbers reloads nothing');

  live.signal({ campus: 'HSC', board: 'events', version: 2 });
  tick(2_999);
  assert.deepEqual(calls, []);
  tick(1);
  assert.deepEqual(calls, ['events']);
  tick(60_000);
  assert.deepEqual(calls, ['events'], 'no further reloads without a further change');
  live.dispose();
});

test('a burst of edits becomes one reload, never held back more than 12 seconds', async (t) => {
  const { live, calls, tick } = rig(t);
  live.start();
  await settle();
  for (let version = 2; version <= 7; version += 1) {
    live.signal({ campus: 'HSC', board: 'events', version });
    tick(2_000);
  }
  // Six edits two seconds apart: still busy, but 12 seconds have passed
  assert.deepEqual(calls, ['events']);
  tick(10_000);
  assert.deepEqual(calls, ['events']);
  live.dispose();
});

test('a long editing session reloads the board at most every 20 seconds', async (t) => {
  const { live, calls, tick } = rig(t);
  live.start();
  await settle();
  // An edit every 5 seconds for two minutes
  for (let version = 2; version <= 25; version += 1) {
    live.signal({ campus: 'HSC', board: 'events', version });
    tick(5_000);
  }
  tick(20_000);
  // 24 edits: reloads at 3 s, then every 20 s (23, 43, 63, 83, 103, 123 s)
  assert.equal(calls.length, 7);
  assert.ok(calls.every((board) => board === 'events'));
  live.dispose();
});

test('an isolated change right after a reload waits out the 20 second gap', async (t) => {
  const { live, calls, tick } = rig(t);
  live.start();
  await settle();
  live.signal({ campus: 'HSC', board: 'requests', version: 2 });
  tick(3_000);
  assert.deepEqual(calls, ['requests']);
  live.signal({ campus: 'HSC', board: 'requests', version: 3 });
  tick(19_999); // 20 seconds after the first reload, not 3 seconds after this change
  assert.deepEqual(calls, ['requests']);
  tick(1);
  assert.deepEqual(calls, ['requests', 'requests']);
  live.dispose();
});

test('repeated numbers, other campuses and junk rows change nothing', async (t) => {
  const { live, calls, tick } = rig(t);
  live.start();
  await settle();
  live.signal({ campus: 'HSC', board: 'events', version: 1 });
  live.signal({ campus: 'HSN', board: 'events', version: 99 });
  live.signal({ campus: 'HSC', board: 'departments', version: 5 });
  live.signal({ campus: 'HSC', board: 'events', version: 'abc' });
  live.signal(null);
  live.signal({});
  tick(20_000);
  assert.deepEqual(calls, []);
  live.dispose();
});

test('a hidden screen fetches nothing and catches up when it is shown', async (t) => {
  const { live, state, calls, bump, tick } = rig(t);
  live.start();
  await settle();
  state.hidden = true;
  live.signal({ campus: 'HSC', board: 'requests', version: 2 });
  tick(20_000);
  assert.deepEqual(calls, []);

  state.hidden = false;
  bump('requests', 2);
  live.visible();
  await settle();
  assert.deepEqual(calls, ['requests']);
  tick(20_000);
  assert.deepEqual(calls, ['requests'], 'the version check agrees, so no second reload');
  live.dispose();
});

test('a missed message is caught by the version check within five minutes', async (t) => {
  const { live, calls, bump, tick } = rig(t);
  live.start();
  await settle();
  live.connection('live');
  await settle();
  bump('events', 4); // changed, but the Realtime message never arrived
  tick(4 * 60_000);
  await settle();
  assert.deepEqual(calls, []);
  tick(60_000); // five minutes since the last check
  await settle();
  tick(3_000);
  assert.deepEqual(calls, ['events']);
  live.dispose();
});

test('while Realtime is down the numbers are checked every minute', async (t) => {
  const { live, state, calls, bump, tick } = rig(t);
  live.start();
  await settle();
  live.connection('offline');
  const before = state.reads;
  bump('events', 2);
  tick(60_000);
  await settle();
  tick(3_000);
  assert.ok(state.reads > before);
  assert.deepEqual(calls, ['events']);
  live.dispose();
});

test('reconnecting picks up whatever changed while offline', async (t) => {
  const { live, calls, statuses, bump, tick } = rig(t);
  live.start();
  await settle();
  live.connection('live');
  live.connection('offline');
  bump('requests', 3);
  live.connection('live');
  await settle();
  tick(3_000);
  assert.deepEqual(calls, ['requests']);
  assert.deepEqual(statuses, ['live', 'offline', 'live']);
  live.dispose();
});

test('everything reloads at midnight and once an hour, but not while hidden', async (t) => {
  const { live, state, calls, tick } = rig(t);
  live.start();
  await settle();
  live.connection('live');
  await settle();

  state.day = '2026-09-28';
  tick(30_000);
  assert.deepEqual(calls, ['all'], 'midnight');

  state.hidden = true;
  tick(61 * 60_000);
  assert.deepEqual(calls, ['all'], 'hidden: nothing fetched');
  state.hidden = false;
  live.visible();
  assert.deepEqual(calls, ['all', 'all'], 'shown again after an hour: full reload');
  live.dispose();
});

test('if the numbers cannot be read, the board still reloads every five minutes', async (t) => {
  const { live, state, calls, tick } = rig(t);
  state.fail = true;
  live.start();
  await settle();
  assert.deepEqual(calls, []);
  for (let i = 0; i < 10; i += 1) {
    tick(60_000);
    await settle();
  }
  assert.deepEqual(calls, ['all', 'all']);
  live.dispose();
});

test('nothing happens after dispose', async (t) => {
  const { live, state, calls, tick } = rig(t);
  live.start();
  await settle();
  live.signal({ campus: 'HSC', board: 'events', version: 2 });
  live.dispose();
  const reads = state.reads;
  state.day = '2026-09-28';
  tick(2 * 60 * 60_000);
  live.signal({ campus: 'HSC', board: 'events', version: 3 });
  live.visible();
  await settle();
  assert.deepEqual(calls, []);
  assert.equal(state.reads, reads);
});
