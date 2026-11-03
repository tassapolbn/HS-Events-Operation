import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Runs src/lib/utils.ts and src/hooks/useTemplates.ts as they are, with the
// database and React Query swapped for small stand-ins.
const realRequire = createRequire(import.meta.url);

function load(path, stubs) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  const require = (name) => (name in stubs ? stubs[name] : realRequire(name));
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}

const utils = load('../src/lib/utils.ts', { dompurify: { addHook() {}, sanitize: (html) => html } });

function setup() {
  const inserted = {};
  let next = 0;
  const supabase = {
    from(table) {
      return {
        insert(payload) {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: `${table}-${++next}`, ...row }));
          (inserted[table] ??= []).push(...rows);
          // Bulk inserts answer in reverse on purpose: the copy must not rely on order
          const many = { data: [...rows].reverse(), error: null };
          const chain = {
            select: () => chain,
            single: () => Promise.resolve({ data: rows[0], error: null }),
            then: (resolve, reject) => Promise.resolve(many).then(resolve, reject)
          };
          return chain;
        }
      };
    }
  };
  const templates = load('../src/hooks/useTemplates.ts', {
    '../lib/supabase': { supabase },
    '../lib/utils': utils,
    '@tanstack/react-query': {
      useMutation: (options) => options,
      useQuery: (options) => options,
      useQueryClient: () => ({ invalidateQueries() {} })
    }
  });
  return { templates, inserted };
}

// Local wall-clock times, the same way the app writes them
const at = (date, time) => utils.combineDateTime(date, time);
const day = (iso) => utils.extractDate(iso);
const clock = (iso) => utils.extractTime(iso);

const departments = [{ id: 'hk', code: 'HK' }];
const sourceEvent = () => ({
  id: 'source', name: 'Sports Week', category: 'sport', location: 'Field', description: '', additional_notes: '',
  internal_notes: '', priority: 'medium', event_date: '2026-11-01', end_date: '2026-11-03',
  setup_start: at('2026-10-31', '16:00'), venue_ready: at('2026-11-01', '07:00'), event_start: at('2026-11-01', '08:00'),
  event_finish: at('2026-11-03', '17:00'), breakdown_start: at('2026-11-03', '17:30'), breakdown_deadline: at('2026-11-04', '09:00'),
  event_sessions: [
    { id: 's1', title: 'Opening', session_date: '2026-11-01', location: 'Hall', start_time: at('2026-11-01', '08:00'), end_time: at('2026-11-01', '12:00'), time_note: '', note: '', sort_order: 0, floor_plan_attachment_id: 'plan-b' },
    { id: 's2', title: 'Night run', session_date: '2026-11-03', location: 'Track', start_time: at('2026-11-03', '20:00'), end_time: at('2026-11-04', '01:00'), time_note: '', note: '', sort_order: 1, floor_plan_attachment_id: 'plan-a' }
  ],
  event_tasks: [
    { id: 't1', department_id: 'hk', title: 'Water for runners', description: '', instructions: '', work_location: '', setup_location: '', assigned_staff: '', priority: 'medium', start_time: at('2026-11-03', '18:00'), completion_time: at('2026-11-03', '19:30'), session_id: 's2', notes: '' },
    { id: 't2', department_id: 'hk', title: 'Chairs', description: '', instructions: '', work_location: '', setup_location: '', assigned_staff: '', priority: 'medium', start_time: at('2026-11-01', '06:30'), completion_time: null, session_id: 's1', notes: '' }
  ]
});
const files = [
  { id: 'plan-a', file_name: 'track.png', storage_path: 'event/source/track.png', mime_type: 'image/png', size_bytes: 10 },
  { id: 'plan-b', file_name: 'hall.png', storage_path: 'event/source/hall.png', mime_type: 'image/png', size_bytes: 20 }
];

async function copy(data, eventDate) {
  const { templates, inserted } = setup();
  await templates.useTemplateMutations().createEventFromTemplate.mutationFn({
    template: { id: 'x', name: 'x', description: '', data, created_by: null, created_at: '', updated_at: '' },
    eventDate, departments, userId: 'u1'
  });
  return inserted;
}

test('copying a past event keeps the day each time falls on', async () => {
  const { templates } = setup();
  const data = templates.templateDataFromEvent(sourceEvent(), departments, files, true, {}, { exactCopy: true });
  const inserted = await copy(data, '2026-12-01');
  const [event] = inserted.events;
  assert.equal(event.end_date, '2026-12-03');
  assert.deepEqual([day(event.setup_start), clock(event.setup_start)], ['2026-11-30', '16:00']);
  assert.deepEqual([day(event.event_finish), clock(event.event_finish)], ['2026-12-03', '17:00']);
  assert.deepEqual([day(event.breakdown_deadline), clock(event.breakdown_deadline)], ['2026-12-04', '09:00']);

  const [opening, night] = inserted.event_sessions;
  assert.equal(night.session_date, '2026-12-03');
  assert.deepEqual([day(night.end_time), clock(night.end_time)], ['2026-12-04', '01:00'], 'a session past midnight still ends the next day');

  const [water, chairs] = inserted.event_tasks;
  assert.deepEqual([day(water.start_time), clock(water.start_time)], ['2026-12-03', '18:00']);
  assert.deepEqual([day(water.completion_time), clock(water.completion_time)], ['2026-12-03', '19:30']);
  assert.equal(water.session_id, night.id);
  assert.deepEqual([day(chairs.start_time), clock(chairs.start_time)], ['2026-12-01', '06:30']);
  assert.equal(chairs.completion_time, null);
  assert.equal(opening.session_date, '2026-12-01');
});

test('copied sessions point at their own copied floor plans', async () => {
  const { templates } = setup();
  const data = templates.templateDataFromEvent(sourceEvent(), departments, files, true, {}, { exactCopy: true });
  const inserted = await copy(data, '2026-12-01');
  const newId = (path) => inserted.attachments.find((row) => row.storage_path === path).id;
  const [opening, night] = inserted.event_sessions;
  assert.equal(opening.floor_plan_attachment_id, newId('event/source/hall.png'));
  assert.equal(night.floor_plan_attachment_id, newId('event/source/track.png'));
  assert.ok(inserted.attachments.every((row) => row.entity_id === inserted.events[0].id));
});

test('saved templates work as before: times on the event date, no floor plan links', async () => {
  const { templates } = setup();
  const data = templates.templateDataFromEvent(sourceEvent(), departments, files, true);
  assert.equal(data.event.time_day_offsets, undefined);
  assert.ok(data.sessions.every((session) => !('floor_plan_index' in session) && !('end_day_offset' in session)));
  assert.ok(data.tasks.every((task) => !('start_day_offset' in task)));
  const inserted = await copy(data, '2026-12-01');
  assert.equal(day(inserted.events[0].event_finish), '2026-12-01');
  assert.equal(day(inserted.event_tasks[0].start_time), '2026-12-01');
  assert.ok(inserted.event_sessions.every((session) => !('floor_plan_attachment_id' in session)));
  assert.equal(inserted.attachments.length, 2);
});

test('a floor plan that is not among the copied files is left off', async () => {
  const { templates } = setup();
  const data = templates.templateDataFromEvent(sourceEvent(), departments, files, false, {}, { exactCopy: true });
  assert.ok(data.sessions.every((session) => session.floor_plan_index === null));
  const inserted = await copy(data, '2026-12-01');
  assert.equal(inserted.attachments, undefined);
  assert.ok(inserted.event_sessions.every((session) => !('floor_plan_attachment_id' in session)));
});
