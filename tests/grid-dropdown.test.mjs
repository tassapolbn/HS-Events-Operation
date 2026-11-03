import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions } from '../src/lib/grid.ts';

const options = [
  { value: '1', labels: ['Team marketing', 'ฝ่ายการตลาด'] },
  { value: '2', labels: ['Marketing team', 'การตลาด'] },
  { value: '3', labels: ['Market', 'ตลาด'] },
  { value: 'market', labels: ['Other'] },
  { value: '5', labels: ['Market support'] },
  { value: '6', labels: ['The market'] }
];
const values = (raw) => filterOptions(raw, options).map((option) => option.value);

test('empty dropdown input preserves every option and its order', () => {
  assert.deepEqual(filterOptions('', options), options);
  assert.deepEqual(filterOptions('   ', options), options);
});

test('dropdown matches rank exact values and labels before prefixes and substrings, stably', () => {
  assert.deepEqual(values('market'), ['3', 'market', '2', '5', '1', '6']);
});

test('dropdown matching ignores case and trims input and labels', () => {
  assert.deepEqual(values('  MaRkEt  '), values('market'));
  assert.deepEqual(filterOptions(' ready ', [{ value: 'r', labels: [' READY '] }]).map((o) => o.value), ['r']);
});

test('dropdown choices match Thai labels', () => {
  assert.deepEqual(values('ตลาด'), ['3', '1', '2']);
  assert.deepEqual(values('การตลาด'), ['2', '1']);
});

test('unmatched dropdown input returns no options', () => {
  assert.deepEqual(values('unknown'), []);
  assert.deepEqual(filterOptions('unknown', []), []);
});
