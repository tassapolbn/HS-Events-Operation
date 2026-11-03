import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullDropRows, planBlockMove } from '../src/lib/boardMove.ts';

const columns = ['a', 'b', 'c', 'd'];
const group = (key, lists) => ({
  key,
  columns: new Map(columns.map((dept) => [dept, (lists[dept] ?? []).map((id, sort_order) => ({
    id, session_id: key || null, department_id: dept, sort_order
  }))]))
});
const allTasks = (groups) => groups.flatMap((item) => [...item.columns.values()].flat());
const apply = (tasks, patches) => {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return tasks.map((task) => ({ ...task, ...byId.get(task.id) }));
};
const order = (tasks, session, dept) => tasks
  .filter((task) => task.session_id === (session || null) && task.department_id === dept)
  .sort((a, b) => a.sort_order - b.sort_order).map((task) => task.id);
const plan = (groups, ids, anchor, target) => planBlockMove({ columns, groups, carried: { ids, anchor }, target });
const assertContiguous = (tasks, session, dept) => assert.deepEqual(tasks
  .filter((task) => task.session_id === (session || null) && task.department_id === dept)
  .map((task) => task.sort_order).sort((a, b) => a - b),
Array.from({ length: order(tasks, session, dept).length }, (_, i) => i));

test('one-column block retains top-to-bottom order and renumbers both touched columns', () => {
  const groups = [group('s1', { a: ['a0', 'a1', 'a2', 'a3'], b: ['b0', 'b1'] })];
  groups[0].columns.get('a')[3].sort_order = 20;
  const original = structuredClone(groups);
  const { patches, undo } = plan(groups, ['a2', 'a1'], 0, { group: 's1', dept: 'b', row: 1 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's1', 'a'), ['a0', 'a3']);
  assert.deepEqual(order(after, 's1', 'b'), ['b0', 'a1', 'a2', 'b1']);
  for (const dept of ['a', 'b']) assertContiguous(after, 's1', dept);
  // a0 and b0 already sit where they belong, so only the four jobs that change are saved
  assert.deepEqual(patches.map((task) => task.id).sort(), ['a1', 'a2', 'a3', 'b1']);
  assert.equal(new Set(patches.map((task) => task.id)).size, patches.length);
  assert.deepEqual(apply(after, undo), allTasks(groups));
  assert.deepEqual(groups, original, 'planning must not mutate the input');
});

test('moving down within a column uses the post-removal drop row, like single-job dragging', () => {
  const groups = [group('s1', { a: ['0', '1', '2', '3', '4', '5'] })];
  const { patches } = plan(groups, ['1', '2'], 0, { group: 's1', dept: 'a', row: 3 });
  assert.deepEqual(order(apply(allTasks(groups), patches), 's1', 'a'), ['0', '3', '4', '1', '2', '5']);
});

test('several columns keep their offsets even when source and destination columns overlap', () => {
  const groups = [group('s1', { a: ['a0', 'a1'], b: ['b0', 'b1'], c: ['c0'] })];
  const { patches, undo } = plan(groups, ['b1', 'a1', 'b0', 'a0'], 0, { group: 's1', dept: 'b', row: 0 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's1', 'a'), []);
  assert.deepEqual(order(after, 's1', 'b'), ['a0', 'a1']);
  assert.deepEqual(order(after, 's1', 'c'), ['b0', 'b1', 'c0']);
  assert.deepEqual(apply(after, undo), allTasks(groups));
});

test('dropping at the first column shifts the block left without losing offsets', () => {
  const groups = [group('s1', { b: ['b0', 'b1'], c: ['c0', 'c1'] })];
  const { patches } = plan(groups, ['b0', 'c0', 'b1', 'c1'], 1, { group: 's1', dept: 'a', row: 0 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's1', 'a'), ['b0', 'b1']);
  assert.deepEqual(order(after, 's1', 'b'), ['c0', 'c1']);
});

test('right-edge clamping merges columns in original row-major order', () => {
  const groups = [group('s1', { a: ['a0', 'a1'], b: ['b0', 'b1'], c: ['c0'], d: ['d0', 'd1'] })];
  const { patches } = plan(groups, ['a1', 'b1', 'c0', 'b0', 'a0'], 0, { group: 's1', dept: 'd', row: 1 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's1', 'd'), ['d0', 'a0', 'b0', 'c0', 'a1', 'b1', 'd1']);
  assertContiguous(after, 's1', 'd');
});

test('the grabbed job lands in the drop column and the rest keep their offset from it', () => {
  const groups = [group('s1', { b: ['b0'], c: ['c0'] }), group('s2', { d: ['d0'] })];
  // Grabbed in column c (index 2) and dropped on column d of another session
  const { patches, undo } = plan(groups, ['b0', 'c0'], 2, { group: 's2', dept: 'd', row: 0 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's2', 'd'), ['c0', 'd0']);
  assert.deepEqual(order(after, 's2', 'c'), ['b0']);
  assert.deepEqual(order(after, 's1', 'b'), []);
  assert.deepEqual(apply(after, undo), allTasks(groups));
});

test('the selection left edge counts even when its column has no selected jobs', () => {
  const groups = [group('s1', { b: ['b0'], c: ['c0'] }), group('s2', {})];
  const { patches } = plan(groups, ['b0', 'c0'], 0, { group: 's2', dept: 'b', row: 0 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's2', 'b'), []);
  assert.deepEqual(order(after, 's2', 'c'), ['b0']);
  assert.deepEqual(order(after, 's2', 'd'), ['c0']);
});

test('cross-session moves renumber all touched jobs and can be undone and redone exactly', () => {
  const groups = [group('s1', { a: ['a0', 'a1', 'a2'], b: ['untouched'] }), group('s2', { b: ['b0', 'b1'] })];
  const before = allTasks(groups);
  before.find((task) => task.id === 'b1').sort_order = 50;
  const { patches, undo } = plan(groups, ['a0', 'a1'], 0, { group: 's2', dept: 'b', row: 1 });
  const after = apply(before, patches);
  assert.deepEqual(order(after, 's1', 'a'), ['a2']);
  assert.deepEqual(order(after, 's2', 'b'), ['b0', 'a0', 'a1', 'b1']);
  assertContiguous(after, 's1', 'a');
  assertContiguous(after, 's2', 'b');
  assert.ok(!patches.some((patch) => patch.id === 'untouched'));
  assert.deepEqual(apply(after, undo), before);
  assert.deepEqual(apply(apply(after, undo), patches), after);
});

test('empty and short destination columns append and whole-event work uses a null session', () => {
  const groups = [group('s1', { a: ['a0', 'a1'], b: ['b0'] }), group('', { c: ['c0'] })];
  const { patches } = plan(groups, ['a0', 'b0', 'a1'], 0, { group: '', dept: 'c', row: 8 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, '', 'c'), ['c0', 'a0', 'a1']);
  assert.deepEqual(order(after, '', 'd'), ['b0']);
  assert.ok(patches.every((patch) => patch.session_id === null));
});

test('dropping a block where it is creates no patches or undo, even with gapped sort orders', () => {
  const groups = [group('s1', { a: ['a0', 'a1', 'a2'], b: ['b0', 'b1', 'b2'] })];
  groups[0].columns.get('a')[1].sort_order = 10;
  groups[0].columns.get('a')[2].sort_order = 20;
  for (const ids of [['a1', 'a2'], ['a1', 'b1', 'a2', 'b2']]) {
    assert.deepEqual(plan(groups, ids, 0, { group: 's1', dept: 'a', row: 1 }), { patches: [], undo: [] });
  }
});

test('a short drop column does not truncate the insertion row in other destination columns', () => {
  const groups = [group('s1', { a: ['a0'], b: ['b0'] }), group('s2', { d: ['d0', 'd1', 'd2', 'd3'] })];
  const { patches } = plan(groups, ['a0', 'b0'], 0, { group: 's2', dept: 'c', row: 3 });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's2', 'c'), ['a0']);
  assert.deepEqual(order(after, 's2', 'd'), ['d0', 'd1', 'd2', 'b0', 'd3']);
});

test('filtered destination rows retain hidden jobs and renumber the complete columns', () => {
  const groups = [group('s1', { a: ['a0'], b: ['b0'] }), group('s2', { c: ['hidden', 'c0', 'c1'], d: ['d0', 'd1'] })];
  const { patches, undo } = plan(groups, ['a0', 'b0'], 0, {
    group: 's2', dept: 'c', row: 1, rows: new Map([['c', 2], ['d', 1]])
  });
  const after = apply(allTasks(groups), patches);
  assert.deepEqual(order(after, 's2', 'c'), ['hidden', 'c0', 'a0', 'c1']);
  assert.deepEqual(order(after, 's2', 'd'), ['d0', 'b0', 'd1']);
  assertContiguous(after, 's2', 'c');
  assertContiguous(after, 's2', 'd');
  assert.deepEqual(apply(after, undo), allTasks(groups));
});

test('a search-filtered drop reads the drop row with the carried jobs lifted out', () => {
  const groups = [group('s1', { a: ['A', 'B', 'C', 'D', 'hidden', 'E'] })];
  const shown = new Map([['a', groups[0].columns.get('a').filter((task) => task.id !== 'hidden')]]);
  const drop = (row) => {
    const rows = fullDropRows({ full: groups[0].columns, visible: shown, carried: ['A', 'B'], row });
    return order(apply(allTasks(groups), plan(groups, ['A', 'B'], 0, { group: 's1', dept: 'a', row, rows }).patches), 's1', 'a');
  };
  // Holding A, the top of the block: it lands on the shown row it was dropped on
  assert.deepEqual(drop(3).filter((id) => id !== 'hidden'), ['C', 'D', 'E', 'A', 'B']);
  assert.deepEqual(drop(1), ['C', 'A', 'B', 'D', 'hidden', 'E']);
  // Without a search the rows are the plain drop row
  assert.deepEqual(fullDropRows({ full: groups[0].columns, visible: groups[0].columns, carried: ['A', 'B'], row: 2 }).get('a'), 2);
});

test('columns merging at an edge keep the order the worksheet shows, even with hidden jobs', () => {
  const groups = [group('s1', { c: ['hidden1', 'hidden2', 'A0', 'A1'], d: ['B0', 'B1'] }), group('s2', {})];
  // The shown 2 by 2 block: A0 B0 on its first row, A1 B1 on its second; A0 is held
  const rows = new Map([['A0', 0], ['A1', 1], ['B0', 0], ['B1', 1]]);
  const { patches } = planBlockMove({
    columns, groups,
    carried: { ids: ['A0', 'B0', 'A1', 'B1'], anchor: 2, rows },
    target: { group: 's2', dept: 'd', row: 0 }
  });
  assert.deepEqual(order(apply(allTasks(groups), patches), 's2', 'd'), ['A0', 'B0', 'A1', 'B1']);
});

test('empty, stale, cross-session or invalid-target carries do not save a partial block', () => {
  const groups = [group('s1', { a: ['a0'] }), group('s2', { a: ['a1'] })];
  for (const ids of [[], ['missing'], ['a0', 'missing'], ['a0', 'a1']]) {
    assert.deepEqual(plan(groups, ids, 0, { group: 's2', dept: 'b', row: 0 }), { patches: [], undo: [] });
  }
  for (const target of [{ group: 'missing', dept: 'b', row: 0 }, { group: 's2', dept: 'missing', row: 0 }]) {
    assert.deepEqual(plan(groups, ['a0'], 0, target), { patches: [], undo: [] });
  }
});
