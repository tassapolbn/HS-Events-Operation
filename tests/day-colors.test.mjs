import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayColor, sessionBarGradient, weekdayOf } from '../src/lib/dayColors.ts';

test('the weekday of a date does not depend on the time zone', () => {
  assert.equal(weekdayOf('2026-10-17'), 6, 'Saturday');
  assert.equal(weekdayOf('2026-10-18'), 0, 'Sunday');
  assert.equal(weekdayOf('2026-10-19'), 1, 'Monday');
  assert.equal(weekdayOf('2027-01-01'), 5, 'Friday');
});

test('each day of the week has the Thai day colour, and neighbours always differ', () => {
  assert.equal(dayColor('2026-10-18').solid, '#b91c1c', 'Sunday is red');
  assert.equal(dayColor('2026-10-19').solid, '#a16207', 'Monday is yellow');
  assert.equal(dayColor('2026-10-21').solid, '#15803d', 'Wednesday is green');
  assert.equal(dayColor('2026-10-23').solid, '#0369a1', 'Friday is light blue');
  assert.equal(dayColor('2026-10-17').solid, '#6d28d9', 'Saturday is purple');
  const week = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  assert.equal(new Set(week.map((day) => dayColor(day).solid)).size, 7, 'seven different colours');
});

/** WCAG relative luminance and contrast ratio */
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('text on every day colour is easy to read', () => {
  for (let offset = 0; offset < 7; offset += 1) {
    const day = `2026-10-${String(18 + offset).padStart(2, '0')}`;
    const color = dayColor(day);
    assert.equal(color.onSolid, '#ffffff', `${day}: white text on a dark tile`);
    assert.ok(contrast(color.solid, color.onSolid) >= 4.5, `${day}: date tile text`);
    assert.ok(contrast(color.deep, color.onSolid) >= 4.5, `${day}: date tile text where the tile is deepest`);
    assert.ok(contrast(color.tint, color.ink) >= 4.5, `${day}: weekday on the banner`);
  }
});

test('a session bar is a dark gradient of its weekday colour, readable in white all the way across', () => {
  assert.equal(sessionBarGradient('2026-10-19'), 'linear-gradient(135deg, #713f12 0%, #854d0e 55%, #a16207 100%)', 'Monday: dark gold');
  for (let offset = 0; offset < 7; offset += 1) {
    const day = `2026-10-${String(18 + offset).padStart(2, '0')}`;
    const stops = sessionBarGradient(day).match(/#[0-9a-f]{6}/g);
    assert.equal(stops.length, 3);
    for (const stop of stops) assert.ok(contrast(stop, '#ffffff') >= 4.5, `${day}: white text on ${stop}`);
  }
});
