import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBoardDate, formatBoardDateRange, formatDate, formatDateRange } from '../src/lib/utils.ts';

test('Thai board dates show the Buddhist year, including month labels and repeated years', () => {
  assert.equal(formatBoardDate('2026-11-23', 'th', 'd MMMM yyyy'), '23 พฤศจิกายน 2569');
  assert.equal(formatBoardDate('2026-11-23', 'th', 'MMMM yyyy'), 'พฤศจิกายน 2569');
  assert.equal(formatBoardDate('2026-11-23', 'th', 'yyyy / yyyy'), '2569 / 2569');
  assert.match(formatBoardDate(new Date(2026, 10, 23), 'th'), /2569$/);
});

test('English board dates keep the Gregorian year', () => {
  assert.equal(formatBoardDate('2026-11-23', 'en', 'd MMMM yyyy'), '23 November 2026');
});

test('board ranges across years show each endpoint year in both languages', () => {
  assert.equal(formatBoardDateRange('2026-12-31', '2027-01-01', 'th', 'd MMMM yyyy'), '31 ธันวาคม 2569 – 1 มกราคม 2570');
  assert.equal(formatBoardDateRange('2026-12-31', '2027-01-01', 'en', 'd MMMM yyyy'), '31 December 2026 – 1 January 2027');
});

test('board ranges within one year show the year once', () => {
  assert.equal(formatBoardDateRange('2026-11-23', '2026-11-24', 'th', 'd MMMM yyyy'), '23 พฤศจิกายน – 24 พฤศจิกายน 2569');
  assert.equal(formatBoardDateRange('2026-11-23', '2026-11-24', 'en', 'd MMMM yyyy'), '23 November – 24 November 2026');
});

test('missing dates and single-day ranges keep existing formatting behavior', () => {
  assert.equal(formatBoardDate(null, 'th'), '-');
  assert.equal(formatBoardDate(undefined, 'en'), '-');
  for (const end of [null, undefined, '2026-11-23', '2026-11-22']) {
    assert.equal(formatBoardDateRange('2026-11-23', end, 'th'), formatBoardDate('2026-11-23', 'th'));
  }
});

test('existing date helpers keep Gregorian data and range formatting', () => {
  assert.equal(formatDate('2026-11-23', 'th', 'yyyy-MM-dd'), '2026-11-23');
  assert.equal(formatDateRange('2026-12-31', '2027-01-01', 'th', 'd MMMM yyyy'), '31 ธันวาคม 2026 – 1 มกราคม 2027');
});
