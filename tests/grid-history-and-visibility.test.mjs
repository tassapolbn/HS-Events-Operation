import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inverseGridEntry } from '../src/lib/gridHistory.ts';
import { sessionHasEnded } from '../src/lib/sessionVisibility.ts';

test('undo and redo preserve the exact changed cells even when rows are filtered', () => {
  const undo = {kind:'update',patches:[{id:'hidden-row',values:{title:'Before'}}]};
  const redo = inverseGridEntry(undo,new Map([['hidden-row',{title:'After',notes:'Keep this note'}]]));
  assert.deepEqual(redo,{kind:'update',patches:[{id:'hidden-row',values:{title:'After'}}]});
  assert.deepEqual(inverseGridEntry(redo,new Map([['hidden-row',{title:'Before',notes:'Keep this note'}]])),undo);
});
test('row history reverses create/delete and rejects unavailable edit targets', () => {
  const create = {kind:'create',ids:['new-row']};
  const remove = inverseGridEntry(create,new Map());
  assert.deepEqual(remove,{kind:'delete',ids:['new-row']});
  assert.deepEqual(inverseGridEntry(remove,new Map()),create);
  assert.throws(()=>inverseGridEntry({kind:'update',patches:[{id:'gone',values:{title:'x'}}]},new Map()),/no longer available/);
});
test('sessions become past at their end time, never merely when they start', () => {
  const session = {session_date:'2026-09-14',end_time:'2026-09-14T17:00:00+07:00'};
  assert.equal(sessionHasEnded(session,Date.parse('2026-09-14T16:59:59+07:00')),false);
  assert.equal(sessionHasEnded(session,Date.parse('2026-09-14T17:00:00+07:00')),true);
});
test('sessions without a known finish remain current through the Bangkok calendar day', () => {
  const session = {session_date:'2026-09-14',end_time:null};
  assert.equal(sessionHasEnded(session,Date.parse('2026-09-14T23:59:59+07:00')),false);
  assert.equal(sessionHasEnded(session,Date.parse('2026-09-15T00:00:00+07:00')),true);
  assert.equal(sessionHasEnded({session_date:'invalid',end_time:null}),false);
});
