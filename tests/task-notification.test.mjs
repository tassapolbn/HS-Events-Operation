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
    events: [{ id: 'event', campus: options.campus ?? 'HSC', name: 'Open Day', event_date: '2026-09-14', deleted_at: null, priority: 'medium' }],
    event_sessions: [{ id: 'session', event_id: 'event', title: 'Afternoon', session_date: '2026-09-15' }],
    departments: [{ id: 'hk', name_en: 'Housekeeping', emails: ['hk@example.test'] }, { id: 'security', name_en: 'Security', emails: ['security@example.test'] }],
    department_requests: [{ id: 'request', department_id: 'hk', status: 'new', deleted_at: null, campus: options.campus ?? 'HSC', description: '<p>Collect boards & chairs</p>', due_date: '2026-09-17', title: 'Request', request_date: '2026-09-14', priority: 'medium' }]
  };
  if (options.deletedTask) tables.event_tasks[0].deleted_at = '2026-09-13';
  if (options.deletedEvent) tables.events[0].deleted_at = '2026-09-13';
  if (options.schedule) Object.assign(tables.department_requests[0], options.schedule);
  const admin = { from(table) {
    const filters = [];
    queries.push({table, filters});
    let single = false, inserted = null, changed = null;
    const builder = {
      select() { return builder; },
      update(value) { changed = value; return builder; },
      eq(field, value) { filters.push([field, value]); return builder; },
      is(field, value) { filters.push([field, value]); return builder; },
      in(field, values) { filters.push([field, values]); return builder; },
      order() { return builder; },
      single() { single = true; return builder; },
      insert(row) { inserted = row; records.push(row); return builder; },
      then(resolve) {
        const rows = (tables[table] ?? []).filter(row => filters.every(([field, value]) => Array.isArray(value) ? value.includes(row[field]) : row[field] === value));
        if (changed && options.updateError) return Promise.resolve({data:null,error:{message:'update failed'}}).then(resolve);
        if (changed) rows.forEach(row => Object.assign(row, changed));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: inserted && options.recordError ? {message:'record failed'} : null }).then(resolve);
      }
    };
    return builder;
  }};
  vm.runInNewContext(script, {
    Request, Response, URL, console,
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', APPS_SCRIPT_URL: 'https://mail.example.test', APP_URL: 'https://app.example.test' })[key] }, serve: callback => { handler = callback; } },
    createClient: (_url, key) => key === 'anon' ? { auth: { getUser: async () => ({data:{user: options.signedOut ? null : {id:'user'}}}) } } : admin,
    fetch: async (_url, init) => { sent.push(JSON.parse(init.body)); return Response.json(options.emailError ? {ok:false,error:'transport unavailable'} : {ok:true}); }
  });
  const response = await handler(new Request('https://fn.example.test', { method: 'POST', headers: {Authorization: 'Bearer test'}, body: JSON.stringify(payload) }));
  return {status:response.status, body:await response.json(), sent, records, queries, requestStatus:tables.department_requests[0].status};
}

test('task notification ignores supplied recipients, sends only chosen saved task with session date', async () => {
  const result = await run({type:'task',id:'chosen',changeKind:'updated',departmentIds:['security']});
  assert.equal(result.status,200);
  assert.deepEqual(result.sent[0].to,['hk@example.test']);
  assert.match(result.sent[0].subject,/Task updated/);
  assert.match(result.sent[0].html,/&lt;Chosen task&gt;/);
  assert.match(result.sent[0].html,/15 September 2026/);
  assert.match(result.sent[0].html,/\?event=event&amp;task=chosen/);
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

 test('all notification types link to the saved campus public board', async () => {
  for (const campus of ['HSC', 'HSN']) {
    for (const [type,id] of [['event','event'],['request','request'],['task','chosen']]) {
      const result = await run({type,id,changeKind:'updated',departmentIds:['hk']},{campus});
      assert.equal(result.status,200);
      const html = result.sent[0].html;
      assert.ok(html.includes(`https://hs-opt.netlify.app/display/${campus.toLowerCase()}?${type === 'request' ? 'request=request' : 'event=event'}`));
      assert.ok(html.includes(type === 'task' ? '&amp;task=chosen' : 'View job on Display Board'));
      assert.doesNotMatch(html,/href="[^"]*\/(events|requests)\//);
      if (type === 'request') {
        assert.match(html,/Collect boards &amp; chairs/);
        assert.match(html,/17 September 2026/);
      }
    }
  }
});
 test('unknown campus never routes an email to the wrong board', async () => {
  const result = await run({type:'request',id:'request',departmentIds:['hk']},{campus:'invalid'});
  assert.equal(result.status,500);
  assert.equal(result.sent.length,0);
});

test('request email separates work and due times from automatic posted time in Bangkok', async () => {
  const result = await run({type:'request',id:'request',departmentIds:['hk']}, {schedule: {
    setup_datetime:'2026-09-16T18:15:00Z', due_at:'2026-09-17T08:30:00Z', created_at:'2026-09-14T02:00:00Z'
  }});
  const html = result.sent[0].html;
  assert.match(html, /WORK STARTS \/ เริ่มดำเนินการ/);
  assert.match(html, /17 September 2026.*01:15/);
  assert.match(html, /COMPLETE BY \/ ต้องเสร็จภายใน/);
  assert.match(html, /17 September 2026.*15:30/);
  assert.match(html, /Posted \/ วันลงงาน: 14 September 2026.*09:00/);
  assert.match(html, /Thailand time \(UTC\+7\)/);
  assert.equal(result.body.templateVersion, 'support-board-20260916');
});

test('date-only legacy requests do not acquire a fabricated deadline time', async () => {
  const result = await run({type:'request',id:'request',departmentIds:['hk']});
  assert.match(result.sent[0].html, /17 September 2026 · Time not specified/);
  assert.match(result.sent[0].html, /Not scheduled \/ ยังไม่ระบุ/);
});


test('cancellation saves status and notifies only the assigned department', async () => {
  const result = await run({type:'request_cancel',id:'request',departmentIds:['security']});
  assert.equal(result.status,200);
  assert.equal(result.requestStatus,'cancelled');
  assert.equal(result.body.cancelled,true);
  assert.deepEqual(result.sent[0].to,['hk@example.test']);
  assert.match(result.sent[0].subject,/Cancelled/);
  assert.match(result.sent[0].html,/This work is no longer required/);
  assert.doesNotMatch(result.sent[0].html,/\?request=/);
  assert.match(result.sent[0].html,/https:\/\/hs-opt.netlify.app\/display\/hsc/);
  assert.equal(result.records[0].kind,'request');
  assert.equal(result.records[0].request_id,'request');
  assert.equal(result.records[0].department_id,'hk');
});

test('unauthorized, deleted or failed cancellations send nothing', async () => {
  for (const options of [{signedOut:true},{role:'department'},{schedule:{deleted_at:'2026-09-17'}},{updateError:true}]) {
    const result = await run({type:'request_cancel',id:'request'},options);
    assert.ok(result.status>=400);
    assert.equal(result.requestStatus,'new');
    assert.equal(result.sent.length,0);
  }
});

test('notification failure keeps cancellation saved and allows an explicit retry', async () => {
  const result = await run({type:'request_cancel',id:'request'},{emailError:true});
  assert.equal(result.requestStatus,'cancelled');
  assert.match(result.body.results[0].error,/transport unavailable/);
  assert.equal(result.records[0].email_sent,false);
  const duplicate = await run({type:'request_cancel',id:'request'},{schedule:{status:'cancelled'}});
  assert.equal(duplicate.body.alreadyCancelled,true);
  assert.equal(duplicate.sent.length,0);
  const retry = await run({type:'request_cancel',id:'request',retryNotification:true},{schedule:{status:'cancelled'},campus:'HSN'});
  assert.equal(retry.sent.length,1);
  assert.match(retry.sent[0].html,/https:\/\/hs-opt.netlify.app\/display\/hsn/);
});
