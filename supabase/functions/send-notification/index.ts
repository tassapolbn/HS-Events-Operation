// Supabase Edge Function: send-notification
// Sends department notification emails via Resend and records
// in-app notifications. Only the Events Team / Admin may call it.
//
// Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY   - from https://resend.com
//   NOTIFY_FROM      - e.g. "HeadStart Events <onboarding@resend.dev>"
// Display links use the production board at https://hs-opt.netlify.app.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const TEMPLATE_VERSION = 'session-notify-20260918';

/** Photos stay reachable in an inbox for a month without making the bucket public. */
const PHOTO_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

interface Payload {
  type: 'event' | 'request' | 'task' | 'request_cancel' | 'session_tasks';
  retryNotification?: boolean;
  changeKind?: 'added' | 'updated';
  id: string;
  departmentIds: string[];
  /** session_tasks: the exact jobs the events team chose to send */
  taskIds?: string[];
}

/** One job as it appears in a session email: what to do, when, and a photo of it. */
interface TaskBlock {
  title: string;
  lines: string[];
  photos: { url: string; name: string }[];
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayLink(campus: string, type: 'event' | 'request' | 'task' | 'session', id: string, eventId?: string): string {
  const code = campus?.toLowerCase();
  if (code !== 'hsc' && code !== 'hsn') throw new Error('Unknown campus for notification');
  const url = new URL(`/display/${code}`, 'https://hs-opt.netlify.app');
  url.searchParams.set(type === 'request' ? 'request' : 'event', eventId || id);
  if (type === 'task') url.searchParams.set('task', id);
  return url.toString();
}

/** Who to ask about an event, on one line, for an email row. */
function contactLine(contacts: unknown): string {
  if (!Array.isArray(contacts)) return '-';
  const people = contacts
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .map((item) => {
      const name = String(item.name ?? '').trim();
      if (!name) return '';
      const extra = [item.role, item.phone, item.email].map((part) => String(part ?? '').trim()).filter(Boolean);
      return extra.length > 0 ? `${name} (${extra.join(', ')})` : name;
    })
    .filter(Boolean);
  return people.length > 0 ? people.join('\n') : '-';
}

function plainText(value: string | null | undefined): string {
  return (value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, ' ').trim();
}

function readableDate(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
}

function readableSchedule(value: string | null | undefined): string {
  if (!value) return 'Not scheduled / ยังไม่ระบุ';
  if (value.length === 10) return `${readableDate(value)} · Time not specified / ยังไม่ระบุเวลา`;
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: 'Asia/Bangkok'
  });
}

function emailHtml(options: {
  heading: string;
  eventName: string;
  eventDate: string;
  departmentName: string;
  campus: string;
  description?: string;
  cancelled?: boolean;
  schedule?: { start?: string | null; due?: string | null };
  postedAt?: string;
  rows: { label: string; value: string }[];
  taskLines: string[];
  /** Richer than taskLines: each job keeps its own details and photos */
  taskBlocks?: TaskBlock[];
  photos?: { url: string; name: string }[];
  link: string;
}): string {
  const detailRows = options.rows.filter(r => r.value && r.value !== '-').map(r =>
    `<tr><td width="35%" valign="top" style="padding:12px 16px;border-bottom:1px solid #E5EAF0;color:#526579;font-size:13px;">${esc(r.label)}</td><td valign="top" style="padding:12px 16px;border-bottom:1px solid #E5EAF0;color:#003057;font-size:14px;font-weight:bold;overflow-wrap:anywhere;white-space:pre-line;">${esc(r.value)}</td></tr>`
  ).join('');
  const tasks = options.taskLines.map(t => `<li style="margin:8px 0;">${esc(t)}</li>`).join('');
  // A photo answers "which table?" faster than any sentence can
  const photoStrip = (photos: { url: string; name: string }[]) => photos.length === 0 ? '' :
    photos.map(photo => `<div style="margin:10px 0;"><img src="${esc(photo.url)}" alt="${esc(photo.name)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid #DCE4EC;border-radius:10px;" /><p style="margin:6px 0 0;font-size:11px;color:#64748B;">${esc(photo.name)}</p></div>`).join('');
  const blocks = (options.taskBlocks ?? []).map((block, index) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;background:#F5F8FB;border-left:4px solid #003057;border-collapse:collapse;"><tr><td style="padding:14px 16px;">
<p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#003057;overflow-wrap:anywhere;">${index + 1}. ${esc(block.title)}</p>
${block.lines.filter(Boolean).map(line => `<p style="margin:0 0 4px;font-size:13px;line-height:1.7;color:#526579;overflow-wrap:anywhere;white-space:pre-line;">${esc(line)}</p>`).join('')}
${photoStrip(block.photos)}
</td></tr></table>`).join('');
  const campusName = options.campus === 'HSN' ? 'Cherngtalay Campus' : 'Chaofah City Campus';
  const schedule = options.schedule ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 8px;table-layout:fixed;"><tr>
<td class="schedule-cell" width="50%" valign="top" style="padding:16px;background:#EEF5FC;border-top:3px solid #003057;"><p style="margin:0 0 8px;color:#526579;font-size:12px;font-weight:bold;">WORK STARTS / เริ่มดำเนินการ</p><p style="margin:0;font-size:16px;font-weight:bold;line-height:1.6;color:#003057;">${esc(readableSchedule(options.schedule.start))}</p></td>
<td class="schedule-cell" width="50%" valign="top" style="padding:16px;background:#FFFAEB;border-top:3px solid #F0B323;"><p style="margin:0 0 8px;color:#715719;font-size:12px;font-weight:bold;">COMPLETE BY / ต้องเสร็จภายใน</p><p style="margin:0;font-size:16px;font-weight:bold;line-height:1.6;color:#003057;">${esc(readableSchedule(options.schedule.due))}</p></td>
</tr></table><p style="margin:0 0 24px;font-size:11px;color:#526579;">Thailand time (UTC+7) / เวลาไทย</p>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media only screen and (max-width:480px){.email-content{padding:22px 18px!important}.schedule-cell{display:block!important;width:auto!important}.email-title{font-size:23px!important}}</style></head>
<body style="margin:0;padding:0;background:#EDF2F7;font-family:Arial,Tahoma,sans-serif;color:#003057;">
<!-- email-template: ${TEMPLATE_VERSION} -->
<div style="display:none;max-height:0;overflow:hidden;">${esc(options.heading)}: ${esc(options.eventName)} · ${esc(options.departmentName)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDF2F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #DCE4EC;border-radius:16px;overflow:hidden;">
<tr><td class="email-content" style="background:#003057;border-top:5px solid #F0B323;padding:24px 28px;">
<p style="margin:0;color:#FFFFFF;font-size:22px;font-weight:bold;letter-spacing:0.2px;">HeadStart <span style="color:#F0B323;">Event Operations</span></p>
<p style="margin:8px 0 0;color:#DAE6F0;font-size:12px;line-height:1.7;">${esc(campusName)} · ${esc(options.campus)}</p>
</td></tr>
<tr><td class="email-content" style="padding:28px;">
<p style="margin:0 0 12px;color:#526579;font-size:12px;font-weight:bold;">${esc(options.heading)}</p>
<h1 class="email-title" style="margin:0 0 12px;font-size:27px;line-height:1.4;color:#003057;overflow-wrap:anywhere;">${esc(options.eventName)}</h1>
<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#526579;">Assigned to / แผนกรับผิดชอบ<br><strong style="color:#003057;font-size:16px;">${esc(options.departmentName)}</strong></p>
${options.eventDate ? `<p style="margin:12px 0 20px;font-size:14px;color:#526579;">${esc(options.eventDate)}</p>` : ''}
${options.cancelled ? `<p style="padding:16px;background:#FEF2F2;border-left:4px solid #DC2626;color:#991B1B;font-weight:bold;line-height:1.8;">CANCELLED / ยกเลิกงานแล้ว<br>This work is no longer required. It has been removed from the active board.<br>ไม่ต้องดำเนินงานนี้ต่อ งานถูกนำออกจากบอร์ดแล้ว</p>` : ''}
${schedule}
${options.description ? `<div style="margin:24px 0;"><p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:#526579;">JOB DETAILS / รายละเอียดงาน</p><div style="font-size:15px;line-height:1.8;white-space:pre-line;color:#243B53;overflow-wrap:anywhere;">${esc(options.description)}</div></div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F8FB;border-collapse:collapse;">${detailRows}</table>
${options.photos && options.photos.length ? `<div style="margin:24px 0;"><p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:#526579;">PHOTOS / รูปประกอบ</p>${photoStrip(options.photos)}</div>` : ''}
${tasks ? `<p style="margin:24px 0 8px;font-size:14px;font-weight:bold;">Assigned work / งานที่มอบหมาย</p><ul style="margin:0;padding-left:22px;font-size:15px;line-height:1.7;">${tasks}</ul>` : ''}
${blocks ? `<p style="margin:24px 0 10px;font-size:14px;font-weight:bold;">Assigned work / งานที่มอบหมาย</p>${blocks}` : ''}
<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:28px auto 16px;"><tr><td bgcolor="#F0B323" style="border-radius:8px;text-align:center;"><a href="${esc(options.link)}" style="display:inline-block;padding:16px 24px;border:1px solid #F0B323;border-radius:8px;color:#003057;font-size:15px;font-weight:bold;text-decoration:none;">${options.cancelled ? 'View Display Board / ดูบอร์ดงาน' : 'View job on Display Board / ดูงาน'}</a></td></tr></table>
<p style="margin:0;text-align:center;color:#526579;font-size:12px;line-height:1.8;">Open the board to view the latest details and status.<br>ดูรายละเอียดและสถานะล่าสุดบน Display Board</p>
${options.postedAt ? `<p style="margin:22px 0 0;color:#64748B;font-size:11px;line-height:1.7;text-align:center;">Posted / วันลงงาน: ${esc(readableSchedule(options.postedAt))}<br>Recorded automatically · บันทึกอัตโนมัติ</p>` : ''}
</td></tr>
<tr><td style="padding:18px 28px;background:#F5F8FB;border-top:1px solid #E5EAF0;color:#526579;font-size:11px;line-height:1.7;text-align:center;">HeadStart Event Operations<br>Automated notification / การแจ้งเตือนอัตโนมัติ</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Email transport 1 (recommended, no IT needed): Google Apps Script web app
    const appsScriptUrl = Deno.env.get('APPS_SCRIPT_URL') ?? '';
    const appsScriptSecret = Deno.env.get('APPS_SCRIPT_SECRET') ?? '';
    // Email transport 2 (optional): Resend (requires verified domain)
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const notifyFrom = Deno.env.get('NOTIFY_FROM') ?? 'HeadStart Events <onboarding@resend.dev>';

    // 1. Verify the caller is an authenticated Events Team member
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user }
    } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();
    if (!profile || !['admin', 'events_team'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Only the Events Team can send notifications' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payload = (await req.json()) as Payload;
    const validPayload = Boolean(payload?.id) && ['event', 'request', 'task', 'request_cancel', 'session_tasks'].includes(payload?.type)
      && (payload.type === 'task'
        ? ['added', 'updated'].includes(payload.changeKind ?? '')
        : payload.type === 'request_cancel'
          ? true
          : payload.type === 'session_tasks'
            ? Array.isArray(payload.taskIds) && payload.taskIds.length > 0
              && Array.isArray(payload.departmentIds) && payload.departmentIds.length > 0
            : Array.isArray(payload.departmentIds) && payload.departmentIds.length > 0);
    if (!validPayload) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let cancelledRequest = null;
    if (payload.type === 'request_cancel') {
      const found = await admin.from('department_requests').select('*').eq('id', payload.id).is('deleted_at', null).single();
      if (found.error || !found.data) return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      cancelledRequest = found.data;
      // Validate the saved campus before changing the request.
      displayLink(cancelledRequest.campus, 'request', cancelledRequest.id);
      if (cancelledRequest.status === 'cancelled' && !payload.retryNotification) {
        return new Response(JSON.stringify({ ok: true, cancelled: true, alreadyCancelled: true, results: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // The recipient is derived from the saved task; callers cannot broaden it.
    let task = null;
    let taskEvent = null;
    let taskSession = null;
    let departmentIds = cancelledRequest ? [cancelledRequest.department_id] : payload.departmentIds;
    if (payload.type === 'task') {
      const found = await admin.from('event_tasks').select('*').eq('id', payload.id).is('deleted_at', null).single();
      if (found.error || !found.data) return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      task = found.data;
      const parent = await admin.from('events').select('*').eq('id', task.event_id).is('deleted_at', null).single();
      if (parent.error || !parent.data) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      taskEvent = parent.data;
      if (task.session_id) {
        const session = await admin.from('event_sessions').select('*').eq('id', task.session_id).eq('event_id', task.event_id).single();
        if (session.error) throw session.error;
        taskSession = session.data;
      }
      departmentIds = [task.department_id];
    }

    /** Signed links so a photo opens from an inbox without the bucket being public. */
    const photosFor = async (taskIds: string[]) => {
      const byTask = new Map<string, { url: string; name: string }[]>();
      if (taskIds.length === 0) return byTask;
      const { data: files } = await admin
        .from('attachments')
        .select('entity_id, file_name, storage_path, mime_type')
        .eq('entity_type', 'event_task')
        .in('entity_id', taskIds)
        .order('created_at');
      for (const file of files ?? []) {
        if (!String(file.mime_type ?? '').startsWith('image/')) continue;
        const signed = await admin.storage.from('attachments').createSignedUrl(file.storage_path, PHOTO_URL_TTL_SECONDS);
        if (!signed.data?.signedUrl) continue;
        const list = byTask.get(file.entity_id) ?? [];
        // Three is plenty to identify a thing; more would make the email unreadable
        if (list.length < 3) list.push({ url: signed.data.signedUrl, name: file.file_name });
        byTask.set(file.entity_id, list);
      }
      return byTask;
    };

    // The events team picks the jobs; each department is emailed only its own.
    let sessionRow = null;
    let sessionEvent = null;
    let sessionTasks: Record<string, unknown>[] = [];
    let sessionPhotos = new Map<string, { url: string; name: string }[]>();
    if (payload.type === 'session_tasks') {
      const found = await admin.from('event_sessions').select('*').eq('id', payload.id).single();
      if (found.error || !found.data) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      sessionRow = found.data;
      const parent = await admin.from('events').select('*').eq('id', sessionRow.event_id).is('deleted_at', null).single();
      if (parent.error || !parent.data) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      sessionEvent = parent.data;
      // Only jobs that really sit in this session can be sent, whatever was asked for
      const chosen = await admin.from('event_tasks').select('*')
        .in('id', payload.taskIds ?? [])
        .eq('session_id', sessionRow.id)
        .eq('event_id', sessionRow.event_id)
        .is('deleted_at', null);
      if (chosen.error) throw chosen.error;
      sessionTasks = chosen.data ?? [];
      if (sessionTasks.length === 0) return new Response(JSON.stringify({ error: 'None of those jobs are in this session' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      sessionPhotos = await photosFor(sessionTasks.map(item => item.id as string));
      // A department with nothing chosen is never emailed an empty list
      const withWork = new Set(sessionTasks.map(item => item.department_id as string));
      departmentIds = payload.departmentIds.filter(id => withWork.has(id));
      if (departmentIds.length === 0) return new Response(JSON.stringify({ error: 'No chosen job belongs to those departments' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const taskPhotos = payload.type === 'task' && task ? await photosFor([task.id as string]) : new Map();

    const { data: departments, error: departmentError } = await admin
      .from('departments')
      .select('id, code, name_en, emails')
      .in('id', departmentIds);
    if (departmentError) throw departmentError;
    if (!departments?.length) throw new Error('No recipient department found');

    if (cancelledRequest && cancelledRequest.status !== 'cancelled') {
      const saved = await admin.from('department_requests').update({ status: 'cancelled' })
        .eq('id', cancelledRequest.id).eq('status', cancelledRequest.status).is('deleted_at', null).select('*').single();
      if (saved.error || !saved.data) throw new Error('Could not cancel request. Refresh and try again.');
      cancelledRequest = saved.data;
    }

    const results: { department: string; emailed: string[]; error?: string }[] = [];
    /** Jobs whose email actually went out, so they stop showing as unsent */
    const notifiedIds: string[] = [];

    for (const dept of departments ?? []) {
      let subject = '';
      let html = '';
      let inAppTitle = '';
      let inAppBody = '';
      let eventId: string | null = null;
      let requestId: string | null = null;

      if (cancelledRequest) {
        requestId = cancelledRequest.id;
        subject = `[Cancelled / ยกเลิกงาน] ${cancelledRequest.title} · ${dept.name_en}`;
        inAppTitle = `Cancelled / ยกเลิกงาน: ${cancelledRequest.title}`;
        inAppBody = 'This work is no longer required. / ไม่ต้องดำเนินงานนี้ต่อ';
        html = emailHtml({
          heading: 'Request cancelled / ยกเลิกคำขอ', eventName: cancelledRequest.title,
          eventDate: '', departmentName: dept.name_en, campus: cancelledRequest.campus,
          cancelled: true, description: plainText(cancelledRequest.description),
          rows: [
            { label: 'Location / สถานที่', value: cancelledRequest.location || '-' },
            { label: 'Reference', value: cancelledRequest.reference || '-' },
            { label: 'Original work start / กำหนดเริ่มเดิม', value: readableSchedule(cancelledRequest.setup_datetime) }
          ], taskLines: [],
          link: displayLink(cancelledRequest.campus, 'request', cancelledRequest.id).split('?')[0]
        });
      } else if (payload.type === 'task' && task && taskEvent) {
        const action = payload.changeKind === 'added' ? 'Task added / เพิ่มงาน' : 'Task updated / แก้ไขงาน';
        const plain = (value: string | null) => (value ?? '').replace(/<[^>]*>/g, ' ').trim();
        eventId = taskEvent.id;
        subject = `[${action}] ${task.title} - ${taskEvent.name}`;
        inAppTitle = `${action}: ${task.title}`;
        inAppBody = `${taskEvent.name} · ${taskSession?.title || taskSession?.session_date || taskEvent.event_date} · ${task.title}`;
        html = emailHtml({
          heading: action, eventName: task.title,
          eventDate: readableDate(taskSession?.session_date || taskEvent.event_date),
          departmentName: dept.name_en,
          campus: taskEvent.campus,
          description: plainText(task.description),
          schedule: { start: task.start_time, due: task.completion_time },
          rows: [
            { label: 'Event / กิจกรรม', value: taskEvent.name },
            { label: 'Ask / สอบถามได้ที่', value: contactLine(taskEvent.contacts) },
            { label: 'Session', value: taskSession?.title || '-' },
            { label: 'Location', value: task.work_location || taskSession?.location || taskEvent.location || '-' },
            { label: 'Assigned staff', value: task.assigned_staff || '-' },
            { label: 'Instructions', value: plain(task.instructions) || '-' },
            { label: 'Notes', value: plain(task.notes) || '-' }
          ],
          taskLines: [],
          photos: taskPhotos.get(task.id as string) ?? [],
          link: displayLink(taskEvent.campus, 'task', task.id, taskEvent.id)
        });
      } else if (payload.type === 'session_tasks' && sessionRow && sessionEvent) {
        // One email per department, listing only the jobs that belong to it
        const mine = sessionTasks.filter(item => item.department_id === dept.id);
        if (mine.length === 0) continue;
        const sessionName = (sessionRow.title as string) || readableDate(sessionRow.session_date as string);
        const plain = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g, ' ').trim();
        eventId = sessionEvent.id;
        subject = `[New work / งานใหม่] ${sessionEvent.name} · ${sessionName} · ${dept.name_en}`;
        inAppTitle = `New work / งานใหม่: ${sessionEvent.name} · ${sessionName}`;
        inAppBody = `${mine.length} job(s) for ${dept.name_en} / ${mine.length} งานสำหรับ ${dept.name_en}`;
        html = emailHtml({
          heading: `New work added / เพิ่มงานใหม่ (${mine.length})`,
          eventName: sessionEvent.name,
          eventDate: readableDate((sessionRow.session_date as string) || (sessionEvent.event_date as string)),
          departmentName: dept.name_en,
          campus: sessionEvent.campus,
          rows: [
            { label: 'Session', value: sessionName },
            { label: 'Ask / สอบถามได้ที่', value: contactLine(sessionEvent.contacts) },
            { label: 'Date / วันที่', value: readableDate(sessionRow.session_date as string) },
            { label: 'Location / สถานที่', value: (sessionRow.location as string) || (sessionEvent.location as string) || '-' },
            { label: 'Session time / เวลา', value: sessionRow.start_time ? `${readableSchedule(sessionRow.start_time as string)}${sessionRow.end_time ? ` - ${readableSchedule(sessionRow.end_time as string)}` : ''}` : '-' },
            { label: 'Session note / หมายเหตุ', value: plain(sessionRow.note) || '-' }
          ],
          taskLines: [],
          taskBlocks: mine.map(item => ({
            title: String(item.title ?? ''),
            lines: [
              item.work_location ? `Location / สถานที่: ${item.work_location}` : '',
              item.assigned_staff ? `Assigned / ผู้รับผิดชอบ: ${item.assigned_staff}` : '',
              item.start_time ? `Start / เริ่ม: ${readableSchedule(item.start_time as string)}` : '',
              item.completion_time ? `Complete by / เสร็จภายใน: ${readableSchedule(item.completion_time as string)}` : '',
              plain(item.description),
              plain(item.instructions),
              plain(item.notes)
            ].filter(Boolean) as string[],
            photos: sessionPhotos.get(item.id as string) ?? []
          })),
          link: displayLink(sessionEvent.campus, 'session', sessionRow.id as string, sessionEvent.id as string)
        });
      } else if (payload.type === 'event') {
        const { data: event } = await admin
          .from('events')
          .select('*')
          .eq('id', payload.id)
          .single();
        if (!event) continue;
        const { data: tasks } = await admin
          .from('event_tasks')
          .select('title, start_time, priority')
          .eq('event_id', payload.id)
          .eq('department_id', dept.id)
          .is('deleted_at', null)
          .order('sort_order');

        eventId = event.id;
        subject = `[Event] ${event.name} - ${dept.name_en}`;
        inAppTitle = event.name;
        inAppBody = `New event tasks for ${dept.name_en}. ${tasks?.length ?? 0} task(s) assigned.`;
        const fmtTime = (v: string | null) =>
          v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : '-';
        html = emailHtml({
          heading: 'Event Job Request',
          eventName: event.name,
          eventDate: readableDate(event.event_date),
          departmentName: dept.name_en,
          campus: event.campus,
          description: plainText(event.description),
          rows: [
            { label: 'Ask / สอบถามได้ที่', value: contactLine(event.contacts) },
            { label: 'Location', value: event.location || '-' },
            { label: 'Setup start', value: fmtTime(event.setup_start) },
            { label: 'Venue ready', value: fmtTime(event.venue_ready) },
            { label: 'Event time', value: `${fmtTime(event.event_start)} to ${fmtTime(event.event_finish)}` },
            { label: 'Breakdown', value: `${fmtTime(event.breakdown_start)} to ${fmtTime(event.breakdown_deadline)}` },
            { label: 'Priority', value: event.priority }
          ],
          taskLines: (tasks ?? []).map((t) => t.title),
          link: displayLink(event.campus, 'event', event.id)
        });
      } else {
        const { data: request } = await admin
          .from('department_requests')
          .select('*')
          .eq('id', payload.id)
          .single();
        if (!request) continue;
        requestId = request.id;
        subject = `[Request] ${request.title} - ${dept.name_en}`;
        inAppTitle = request.title;
        inAppBody = `New department request for ${dept.name_en}.`;
        html = emailHtml({
          heading: 'Department Job Request',
          eventName: request.title,
          eventDate: '',
          departmentName: dept.name_en,
          campus: request.campus,
          description: plainText(request.description),
          schedule: { start: request.setup_datetime, due: request.due_at || request.due_date },
          postedAt: request.created_at || request.request_date,
          rows: [
            { label: 'Location', value: request.location || '-' },
            { label: 'Teardown / เก็บงาน', value: request.teardown_datetime ? readableSchedule(request.teardown_datetime) : '-' },
            { label: 'Priority', value: request.priority.charAt(0).toUpperCase() + request.priority.slice(1) },
            { label: 'Reference', value: request.reference || '-' },
            { label: 'Notes / หมายเหตุ', value: plainText(request.notes) || '-' }
          ],
          taskLines: [],
          link: displayLink(request.campus, 'request', request.id)
        });
      }

      // Send the email through the configured transport
      let emailed: string[] = [];
      let errorMsg: string | undefined;
      if (dept.emails.length === 0) {
        errorMsg = 'No notification emails configured for this department';
      } else if (appsScriptUrl) {
        // Google Apps Script web app: sends from the school Gmail account,
        // no domain verification required.
        try {
          const response = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: appsScriptSecret, to: dept.emails, subject, html })
          });
          const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (response.ok && result?.ok) {
            emailed = dept.emails;
          } else {
            errorMsg = `Apps Script error: ${result?.error ?? `HTTP ${response.status}`}`;
          }
        } catch (fetchError) {
          errorMsg = `Apps Script error: ${String(fetchError)}`;
        }
      } else if (resendKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ from: notifyFrom, to: dept.emails, subject, html })
        });
        if (response.ok) {
          emailed = dept.emails;
        } else {
          errorMsg = `Resend error ${response.status}: ${await response.text()}`;
        }
      } else {
        errorMsg = 'No email service configured. Set APPS_SCRIPT_URL (recommended) or RESEND_API_KEY.';
      }

      // Record the in-app notification regardless of email outcome
      const { error: recordError } = await admin.from('notifications').insert({
        kind: payload.type === 'task' || payload.type === 'session_tasks' ? 'event' : payload.type === 'request_cancel' ? 'request' : payload.type,
        title: inAppTitle,
        body: inAppBody,
        event_id: eventId,
        request_id: requestId,
        department_id: dept.id,
        email_sent: emailed.length > 0,
        created_by: user.id
      });

      if (recordError) errorMsg = [errorMsg, 'Could not record the in-app notification'].filter(Boolean).join('; ');
      // Only work that actually reached an inbox counts as sent
      if (emailed.length > 0) {
        if (payload.type === 'session_tasks') {
          for (const item of sessionTasks) if (item.department_id === dept.id) notifiedIds.push(item.id as string);
        } else if (payload.type === 'task' && task) {
          notifiedIds.push(task.id as string);
        }
      }
      results.push({ department: dept.name_en, emailed, error: errorMsg });
    }

    // Marking last, so the session bell only ever stops counting work that went out
    if (notifiedIds.length > 0) {
      const marked = await admin.from('event_tasks').update({ notified_at: new Date().toISOString() }).in('id', notifiedIds);
      if (marked.error) results.push({ department: '-', emailed: [], error: 'Sent, but could not record that it was sent' });
    }

    return new Response(JSON.stringify({ ok: true, cancelled: !!cancelledRequest, templateVersion: TEMPLATE_VERSION, notified: notifiedIds.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
