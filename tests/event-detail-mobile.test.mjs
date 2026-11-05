import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/pages/EventDetailPage.tsx', import.meta.url), 'utf8');
const hook = source.slice(source.indexOf('function useWideScreen()'), source.indexOf('export function EventDetailPage()'));
const viewExpression = source.match(/const effectiveView = (.*);/)[1];
const view = (viewMode, isEventsTeam, wideScreen) =>
  runInNewContext(viewExpression, { viewMode, isEventsTeam, wideScreen });

function mount(browser) {
  let state;
  let effect;
  const context = {
    useState: initialize => [state = initialize(), value => { state = value; }],
    useEffect: callback => { effect = callback; },
    ...(browser === undefined ? {} : { window: browser })
  };
  const initial = runInNewContext(`${hook}\nuseWideScreen()`, context);
  const cleanup = effect();
  return { initial, current: () => state, cleanup };
}

test('phone defaults use Overview and stored choices always win', () => {
  for (const width of [320, 375, 414, 767, 768, 1024]) {
    const screen = mount({ matchMedia: query => {
      assert.equal(query, '(min-width: 768px)');
      return { matches: width >= 768, addEventListener() {}, removeEventListener() {} };
    } });
    assert.equal(view(null, true, screen.initial), width < 768 ? 'overview' : 'grid');
    assert.equal(view(null, false, screen.initial), 'overview');
    for (const stored of ['grid', 'overview', 'department']) {
      assert.equal(view(stored, true, screen.initial), stored);
      assert.equal(view(stored, false, screen.initial), stored);
    }
    screen.cleanup();
  }
});

test('crossing md updates the default and unmount removes the listener', () => {
  let listener;
  const media = {
    matches: false,
    addEventListener(type, callback) { assert.equal(type, 'change'); listener = callback; },
    removeEventListener(type, callback) {
      assert.equal(type, 'change');
      assert.equal(callback, listener);
      listener = undefined;
    }
  };
  const screen = mount({ matchMedia: () => media });
  for (const matches of [true, false]) {
    media.matches = matches;
    listener();
    assert.equal(view(null, true, screen.current()), matches ? 'grid' : 'overview');
    assert.equal(view('department', true, screen.current()), 'department');
  }
  screen.cleanup();
  assert.equal(listener, undefined);
});

test('SSR and test environments without matchMedia use the phone fallback', () => {
  for (const browser of [undefined, {}]) {
    const screen = mount(browser);
    assert.equal(screen.initial, false);
    assert.equal(screen.cleanup, undefined);
  }
});
