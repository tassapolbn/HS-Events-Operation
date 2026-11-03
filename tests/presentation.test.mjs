import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAutoScroll } from '../src/lib/presentation.ts';

test('presentation advances by a rounded 80 percent of the viewport', () => {
  assert.deepEqual(nextAutoScroll(0, 800, 3000), { top: 640, wrap: false });
  assert.deepEqual(nextAutoScroll(240, 803, 3000), { top: 882, wrap: false });
});

test('presentation clamps the final step to the bottom', () => {
  assert.deepEqual(nextAutoScroll(1800, 800, 3000), { top: 2200, wrap: false });
  assert.deepEqual(nextAutoScroll(2195, 800, 3000), { top: 2200, wrap: false });
});

test('presentation wraps at the bottom including its four-pixel tolerance', () => {
  for (const top of [2196, 2200, 2201]) {
    assert.deepEqual(nextAutoScroll(top, 800, 3000), { top: 0, wrap: true });
  }
});

test('presentation stays at the top when all content fits on screen', () => {
  assert.deepEqual(nextAutoScroll(0, 800, 800), { top: 0, wrap: true });
  assert.deepEqual(nextAutoScroll(0, 800, 400), { top: 0, wrap: true });
});
