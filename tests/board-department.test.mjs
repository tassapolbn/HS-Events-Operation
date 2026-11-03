import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardDepartmentKey, resolveBoardDepartment } from '../src/lib/boardDepartment.ts';

const departments = [
  { id: 'kitchen-id', code: 'KITCHEN', name_en: 'Kitchen Team', name_th: 'แผนกครัว' },
  { id: 'IT-id', code: 'IT', name_en: 'Technology', name_th: 'ไอที' }
];

test('department storage is separated by campus', () => {
  assert.equal(boardDepartmentKey(), 'eventops.display.dept.all');
  assert.equal(boardDepartmentKey('chaofah'), 'eventops.display.dept.chaofah');
});

test('missing, all-department and unknown instructions stay distinct', () => {
  for (const value of [null, undefined, 'unknown', 'KITCHEN-ID']) {
    assert.equal(resolveBoardDepartment(value, departments), null);
  }
  for (const value of ['', 'all']) assert.equal(resolveBoardDepartment(value, departments), '');
  assert.equal(resolveBoardDepartment('kitchen', []), null);
});

test('department links accept exact ids, case-insensitive codes and trimmed bilingual names', () => {
  for (const value of ['kitchen-id', 'kitchen', 'KiTcHeN', '  KITCHEN TEAM  ', ' แผนกครัว ']) {
    assert.equal(resolveBoardDepartment(value, departments), 'kitchen-id');
  }
  assert.equal(resolveBoardDepartment('IT-id', departments), 'IT-id');
});

test('ids take precedence over codes, and codes take precedence over names', () => {
  const ambiguous = [
    { id: 'one', code: 'two', name_en: 'three', name_th: 'หนึ่ง' },
    { id: 'two', code: 'three', name_en: 'Other', name_th: 'สอง' }
  ];
  assert.equal(resolveBoardDepartment('two', ambiguous), 'two');
  assert.equal(resolveBoardDepartment('three', ambiguous), 'two');
});
