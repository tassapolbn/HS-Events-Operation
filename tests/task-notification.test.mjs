import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/send-notification/index.ts', import.meta.url), 'utf8').replace(/^import .*;$/m, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

async function run(payload, options = {}) {
  const sent = [], records = [], queries = [];
  let handler;
  const tables = {
    profiles: [{ id: 'user', role: options.role ?? 'admin' }],
    event_tasks: [
      { id: 'chosen', event_id: 'event', department_id: 'hk', session_id: 'session', title: '<Chosen task>', description: '<p>Changed chairs</p>', deleted_at: null },
      { id: 'other', event_id: 'event', department_id: 'security', title: 'PRIVATE OTHER TASK', deleted_at: null }
    ],
    events: [{ id: 'event', name: 'Open Day', event_date: '2026-09-14', deleted_at: null, priority: 'medium' }],
    event_sessions: [{ id: 'session', event_id: 'event', title: 'Afternoon', session_date: '2026-09-15' }],
    departments: [{ id: 'hk', name_en: 'Housekeeping', emails: ['hk@example.test'] }, { id: 'security', name_en: 'Security', emails: ['security@example.test'] }],
    department_requests: [{ id: 'request', title: 'Request', request_date: '2026-09-14', priority: 'medium' }]
  };
  if (options.deletedTask) tables.event_tasks[0].deleted_at = '2026-09-13';
  if (options.deletedEvent) tables.events[0].deleted_at = '2026-09-13';
  const admin = { from(table) {
    const filters = [];
    queries.push({table, filters});
    let single = false, inserted = null;
    const builder = {
      select() { return builder; },
      eq(field, value) { filters.push([field, value]); return builder; },
      is(field, value) { filters.push([field, value]); return builder; },
      in(field, values) { filters.push([field, values]); return builder; },
      order() { return builder; },
      single() { single = true; return builder; },
      insert(row) { inserted = row; records.push(row); return builder; },
      then(resolve) {
        const rows = (tables[table] ?? []).filter(row => filters.every(([field, value]) => Array.isArray(value) ? value.includes(row[field]) : row[field] === value));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: inserted && options.recordError ? {message:'record failed'} : null }).then(resolve);
      }
    };
    return builder;
  }};
  vm.runInNewContext(script, {
    Request, Response, console,
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', APPS_SCRIPT_URL: 'https://mail.example.test', APP_URL: 'https://app.example.test' })[key] }, serve: callback => { handler = callback; } },
    createClient: (_url, key) => key === 'anon' ? { auth: { getUser: async () => ({data:{user: options.signedOut ? null : {id:'user'}}}) } } : admin,
    fetch: async (_url, init) => { sent.push(JSON.parse(init.body)); return Response.json(options.emailError ? {ok:false,error:'transport unavailable'} : {ok:true}); }
  });
  const response = await handler(new Request('https://fn.example.test', { method: 'POST', headers: {Authorization: 'Bearer test'}, body: JSON.stringify(payload) }));
  return {status:response.status, body:await response.json(), sent, records, queries};
}

test('task notification ignores supplied recipients, sends only chosen saved task with session date', async () => {
  const result = await run({type:'task',id:'chosen',changeKind:'updated',departmentIds:['security']});
  assert.equal(result.status,200);
  assert.deepEqual(result.sent[0].to,['hk@example.test']);
  assert.match(result.sent[0].subject,/Task updated/);
  assert.match(result.sent[0].html,/&lt;Chosen task&gt;/);
  assert.match(result.sent[0].html,/2026-09-15/);
  assert.match(result.sent[0].html,/\?task=chosen/);
  assert.doesNotMatch(result.sent[0].html,/PRIVATE OTHER TASK/);
  assert.equal(result.records[0].kind,'event');
  assert.equal(result.records[0].department_id,'hk');
  assert.equal(result.records[0].event_id,'event');
  assert.equal(result.queries.filter(query=>query.table==='event_tasks').length,1);
});
test('added task has its own clear action label', async () => {
  const result = await run({type:'task',id:'chosen',changeKind:'added'});
  assert.match(result.sent[0].subject,/Task added/);
});
test('unauthorized, malformed, missing and deleted task requests cannot send', async () => {
  const payload = {type:'task',id:'chosen',changeKind:'updated'};
  for (const [body, options, status] of [[payload,{signedOut:true},401],[payload,{role:'department'},403],[{...payload,changeKind:'other'},{},400],[{...payload,id:'missing'},{},404],[payload,{deletedTask:true},404],[payload,{deletedEvent:true},404]]) {
    const result = await run(body,options);
    assert.equal(result.status,status);
    assert.equal(result.sent.length,0);
    assert.equal(result.records.length,0);
  }
});
test('transport and recording failures are reported without claiming full delivery', async () => {
  const result = await run({type:'task',id:'chosen',changeKind:'updated'}, {emailError:true});
  assert.match(result.body.results[0].error,/transport unavailable/);
  assert.equal(result.records[0].email_sent,false);
  const failedRecord = await run({type:'task',id:'chosen',changeKind:'updated'}, {recordError:true});
  assert.match(failedRecord.body.results[0].error,/in-app/);
});
test('existing event and request notification flows remain available', async () => {
  for (const [type,id] of [['event','event'],['request','request']]) {
    const result = await run({type,id,departmentIds:['hk']});
    assert.equal(result.status,200);
    assert.equal(result.sent.length,1);
    assert.equal(result.records[0].kind,type);
  }
});
