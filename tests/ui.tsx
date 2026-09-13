// Local browser fixture only. Vite's production entry never imports this file.
// Every write is replaced here; the fixture cannot change production records.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/contexts/AuthContext';
import { LanguageProvider, useLanguage } from '../src/i18n';
import { ToastProvider } from '../src/components/ui/Toast';
import { TaskEditModal } from '../src/components/display/TaskEditModal';
import { TaskDetailModal } from '../src/components/events/TaskDetailModal';
import { TaskGrid } from '../src/components/events/TaskGrid';
import { SessionFormModal } from '../src/components/events/SessionFormModal';
import { EventsBoard } from '../src/components/display/EventsBoard';
import { AttachmentViewer } from '../src/components/display/AttachmentViewer';
import { supabase } from '../src/lib/supabase';
import '../src/index.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const departments = [{ id: 'dept-1', code: 'HK', name_en: 'Housekeeping', name_th: 'แม่บ้าน', color: '#0f766e', icon: 'sparkles' }, { id: 'dept-2', code: 'SEC', name_en: 'Security', name_th: 'รักษาความปลอดภัย', color: '#2563eb', icon: 'shield' }];
const plan = { id: 'plan-1', file_name: 'Morning setup.svg', storage_path: 'test/morning.svg', mime_type: 'image/png' };
const plan2 = { ...plan, id: 'plan-2', file_name: 'Afternoon setup.svg', storage_path: 'test/afternoon.svg' };
const diagram = (name: string, color: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360" viewBox="0 0 900 360"><rect width="900" height="360" fill="white"/><rect x="25" y="25" width="850" height="310" rx="8" fill="#f8fafc" stroke="${color}" stroke-width="3"/><rect x="330" y="50" width="240" height="55" rx="4" fill="${color}"/><text x="450" y="84" text-anchor="middle" fill="white" font-family="sans-serif" font-size="22">${name}</text>${[0,1,2,3,4,5].map(i => `<rect x="${120+i%3*250}" y="${145+Math.floor(i/3)*85}" width="160" height="45" rx="6" fill="white" stroke="${color}" stroke-width="2"/>`).join('')}</svg>`);
client.setQueryData(['floor-plan-url', plan.storage_path], diagram('MORNING · CLASSROOM', '#0f766e'));
client.setQueryData(['floor-plan-url', plan2.storage_path], diagram('AFTERNOON · WORKSHOP', '#2563eb'));
const initialSessions = [{ id: 'session-1', event_id: 'event-1', title: 'Morning classroom', session_date: '2026-09-14', location: 'Main hall', start_time: '2026-09-14T02:00:00Z', end_time: null, time_note: '', note: '', sort_order: 0, floor_plan_attachment_id: plan.id, floor_plan: plan }, { id: 'session-2', event_id: 'event-1', title: 'Afternoon workshop', session_date: '2026-09-14', location: 'Main hall', start_time: '2026-09-14T06:00:00Z', end_time: null, time_note: '', note: '', sort_order: 1, floor_plan_attachment_id: plan2.id, floor_plan: plan2 }];
const initial: any[] = [0,1,2].map(i => ({ id: `task-${i}`, event_id: 'event-1', department_id: i === 2 ? 'dept-2' : 'dept-1', session_id: i === 2 ? 'session-2' : 'session-1', title: ['Arrange 20 chairs', 'Prepare registration table', 'Check workshop setup'][i], assigned_staff: 'Operations team', work_location: 'Main hall', setup_location: '', start_time: null, completion_time: null, priority: 'medium', status: 'not_started', description: i === 0 ? '<p><strong>Keep the aisle clear</strong></p>' : '', instructions: '', notes: '', sort_order: i, created_at: '2026-09-13T00:00:00Z', attachments: [] }));
supabase.auth.getSession = (async () => ({ data: { session: location.search.includes('readonly') ? null : {user:{id:'admin-test'}} }, error: null })) as any;
supabase.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } }) as any;
function Fixture() {
  const { setLang } = useLanguage();
  const [tasks, setTasks] = useState(initial);
  const [sessions, setSessions] = useState(initialSessions);
  const [eventName, setEventName] = useState('School Open Day');
  const [editingTask, setEditingTask] = useState<any>(null);
  const [detailsTask, setDetailsTask] = useState<any>(null);
  const [writeCount, setWriteCount] = useState(0);
  const [view, setView] = useState('grid');
  const [sessionOpen, setSessionOpen] = useState(false);
  const [saved, setSaved] = useState('');
  supabase.rpc = (async (name, args: any) => {
    if (name === 'insert_task_rows') {
      const anchor = tasks.find(task => task.id === args.p_anchor_id);
      if (!anchor) return {data:null,error:{message:'Missing anchor'}};
      const group = tasks.filter(task=>!task.deleted_at && task.department_id===anchor.department_id && task.session_id===anchor.session_id).sort((a,b)=>a.sort_order-b.sort_order);
      const at = group.findIndex(task=>task.id===anchor.id)+(args.p_position==='below'?1:0);
      const created = Array.from({length:args.p_count},(_,n)=>({...initial[0],id:crypto.randomUUID(), title:'', department_id:anchor.department_id,session_id:anchor.session_id,sort_order:at+n,description:'',deleted_at:null}));
      setTasks(prev=>[...prev.map(task=>{const index=group.findIndex(row=>row.id===task.id); return index<0?task:{...task,sort_order:index+(index>=at?created.length:0)};}),...created]);
      setSaved(JSON.stringify({name,...args}));setWriteCount(n=>n+1);
      return {data:created,error:null};
    }
    if (name !== 'update_task_grid') return { data: null, error: { message: 'Write disabled in fixture' } };
    if (args.p_patches.some((p: any) => p.title === 'FAIL')) return { data: null, error: { message: 'Simulated save failure' } };
    setTasks(prev => prev.map(task => ({ ...task, ...args.p_patches.find((p: any) => p.id === task.id) })));
    setSaved(JSON.stringify(args.p_patches));
    return { data: args.p_patches.length, error: null };
  }) as any;
  supabase.from = ((table: string) => {
    let changes: any = null, rowId = '', rowIds: string[] = [], inserted: any[] | null = null;
    const builder: any = { select: () => builder, eq: (field: string, value: string) => { if (field === 'id') rowId = value; return builder; }, is: () => builder, in: (_field: string, ids: string[]) => {rowIds=ids;return builder;}, order: () => builder, single: () => builder, update: (value: any) => { changes = value; return builder; }, insert: (items: any) => { if (table !== 'event_tasks') throw Error('Fixture insert disabled'); inserted = (Array.isArray(items)?items:[items]).map(item=>({...initial[0], ...item, id:crypto.randomUUID(),deleted_at:null})); return builder; }, delete: () => { throw Error('Fixture deletes disabled'); }, then: (resolve: any) => {
      const failed = changes?.title === 'FAIL';
      if (inserted) { setTasks(prev=>[...prev,...inserted!]);setSaved(JSON.stringify({inserted}));setWriteCount(n=>n+1); }
      if (changes && !failed) {
        setSaved(JSON.stringify({table, id:rowId, ...changes})); setWriteCount(n => n + 1);
        if (table === 'event_tasks') setTasks(prev => prev.map(task => task.id === rowId || rowIds.includes(task.id) ? {...task, ...changes} : task));
        if (table === 'event_sessions') setSessions(prev => prev.map(session => session.id === rowId ? {...session, ...changes} : session));
        if (table === 'events' && changes.name) setEventName(changes.name);
      }
      return Promise.resolve({ data: inserted || (table === 'profiles' ? {id:'admin-test',role:'admin'} : table === 'attachments' ? [plan, plan2] : changes || []), error: failed ? {message:'Simulated failure'} : null }).then(resolve);
    } };
    return builder;
  }) as any;
  Object.defineProperty(supabase, 'storage', {configurable:true, value:{from:()=>({createSignedUrl:async (path: string)=>({data:{signedUrl:diagram(path.includes('afternoon')?'AFTERNOON':'MORNING','#0f766e')},error:null})})}});
  Object.defineProperty(supabase, 'functions', { configurable: true, value: { invoke: async (_name: string, options: any) => { setSaved(JSON.stringify(options.body)); return {data:{ok:true,results:[{department:'Housekeeping',emailed:['fixture@example.test']}]},error:null}; } } });
  const activeTasks = tasks.filter(task=>!task.deleted_at);
  const event: any = { id: 'event-1', name: eventName, event_date: '2026-09-14', location: 'Main hall', category: 'school', status: 'confirmed', campus: 'HSC', tasks:activeTasks, sessions,  attachments: [plan, plan2], description: '', additional_notes: '', header_color: '#1a3c5e' };
  return <main className="mx-auto max-w-[1440px] space-y-5 p-4 text-slate-800 sm:p-8">
    <nav className="flex flex-wrap gap-3"><button onClick={() => setView('grid')}>Worksheet</button><button onClick={() => setView('board')}>Board</button><button onClick={() => setSessionOpen(true)}>Edit session</button><button onClick={() => setDetailsTask(tasks[0])}>Task details</button><button onClick={() => setSessions(prev=>prev.map(session=>({...session,session_date:"2026-09-12",start_time:"2026-09-12T02:00:00Z",end_time:"2026-09-12T04:00:00Z"})))}>Past sessions</button><button onClick={() => setLang('th')}>ไทย</button><button onClick={() => setLang('en')}>English</button></nav>
    {view === 'grid' ? <TaskGrid eventId="event-1" eventDate="2026-09-13" tasks={activeTasks as any} departments={departments as any} sessions={sessions} canEdit={!location.search.includes("readonly")} onOpenTask={setDetailsTask} onEditTask={setEditingTask} /> : <EventsBoard events={[event, {...event, id:"event-2", name:"Interleaved event", tasks:[], attachments:[], sessions:[{...sessions[0],id:"middle", title:"Midday session", start_time:"2026-09-14T04:00:00Z",floor_plan:null, floor_plan_attachment_id:null}]}]} departments={departments} selectedDept="" isLoading={false} editMode={!location.search.includes("readonly")} onEditTask={(_event, task) => setEditingTask(task)} />}
    <SessionFormModal open={sessionOpen} onClose={() => setSessionOpen(false)} eventId="event-1" eventDate="2026-09-14" session={sessions[0]} nextSortOrder={2} />
    <TaskEditModal open={!!editingTask} onClose={() => setEditingTask(null)} task={editingTask} event={event} departments={departments} />
    <TaskDetailModal open={!!detailsTask} onClose={() => setDetailsTask(null)} task={detailsTask ? tasks.find(task=>task.id===detailsTask.id) as any : null} eventId="event-1" department={departments[0] as any} onEdit={task=>{setDetailsTask(null);setEditingTask(task);}} />
    <output aria-label="Write count">{writeCount}</output>
    <AttachmentViewer /><output aria-label="Last saved change" className="block break-all text-xs">{saved}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><LanguageProvider><AuthProvider><ToastProvider><Fixture /></ToastProvider></AuthProvider></LanguageProvider></QueryClientProvider>);
