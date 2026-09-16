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

interface Payload {
  type: 'event' | 'request' | 'task';
  changeKind?: 'added' | 'updated';
  id: string;
  departmentIds: string[];
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayLink(campus: string, type: 'event' | 'request' | 'task', id: string, eventId?: string): string {
  const code = campus?.toLowerCase();
  if (code !== 'hsc' && code !== 'hsn') throw new Error('Unknown campus for notification');
  const url = new URL(`/display/${code}`, 'https://hs-opt.netlify.app');
  url.searchParams.set(type === 'request' ? 'request' : 'event', eventId || id);
  if (type === 'task') url.searchParams.set('task', id);
  return url.toString();
}

function plainText(value: string | null | undefined): string {
  return (value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, ' ').trim();
}

function readableDate(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
}

function emailHtml(options: {
  heading: string;
  eventName: string;
  eventDate: string;
  departmentName: string;
  campus: string;
  description?: string;
  rows: { label: string; value: string }[];
  taskLines: string[];
  link: string;
}): string {
  const detailRows = options.rows.filter(r => r.value && r.value !== '-').map(r =>
    `<tr><td width="35%" valign="top" style="padding:12px 16px;border-bottom:1px solid #E5EAF0;color:#526579;font-size:13px;">${esc(r.label)}</td><td valign="top" style="padding:12px 16px;border-bottom:1px solid #E5EAF0;color:#003057;font-size:14px;font-weight:bold;overflow-wrap:anywhere;white-space:pre-line;">${esc(r.value)}</td></tr>`
  ).join('');
  const tasks = options.taskLines.map(t => `<li style="margin:8px 0;">${esc(t)}</li>`).join('');
  const campusName = options.campus === 'HSN' ? 'Cherngtalay Campus' : 'Chaofah City Campus';
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EDF2F7;font-family:Arial,Tahoma,sans-serif;color:#003057;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(options.heading)}: ${esc(options.eventName)} · ${esc(options.departmentName)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDF2F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #DCE4EC;border-radius:16px;overflow:hidden;">
<tr><td style="background:#003057;border-top:6px solid #F0B323;padding:28px 28px 24px;">
<p style="margin:0 0 14px;color:#F0B323;font-size:12px;font-weight:bold;letter-spacing:1px;">HEADSTART INTERNATIONAL SCHOOL</p>
<h1 style="margin:0;color:#FFFFFF;font-size:24px;line-height:1.4;">${esc(options.heading)}</h1>
<p style="margin:10px 0 0;color:#FFFFFF;font-size:13px;">${esc(campusName)} · ${esc(options.campus)}</p>
</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 8px;color:#526579;font-size:13px;">FOR ${esc(options.departmentName.toUpperCase())}</p>
<h2 style="margin:0 0 10px;font-size:22px;line-height:1.5;color:#003057;overflow-wrap:anywhere;">${esc(options.eventName)}</h2>
<p style="margin:0 0 22px;font-size:14px;color:#526579;">${esc(options.eventDate)}</p>
${options.description ? `<div style="border-left:4px solid #F0B323;background:#FFFAEB;padding:16px;margin-bottom:22px;"><p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#003057;">JOB DETAILS / รายละเอียดงาน</p><div style="font-size:15px;line-height:1.8;white-space:pre-line;color:#243B53;">${esc(options.description)}</div></div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F8FB;border-collapse:collapse;">${detailRows}</table>
${tasks ? `<p style="margin:24px 0 8px;font-size:14px;font-weight:bold;">Assigned work / งานที่มอบหมาย</p><ul style="margin:0;padding-left:22px;font-size:15px;line-height:1.7;">${tasks}</ul>` : ''}
<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:28px auto 16px;"><tr><td bgcolor="#F0B323" style="border-radius:8px;text-align:center;"><a href="${esc(options.link)}" style="display:inline-block;padding:16px 24px;border:1px solid #F0B323;border-radius:8px;color:#003057;font-size:15px;font-weight:bold;text-decoration:none;">View job on Display Board / ดูงาน</a></td></tr></table>
<p style="margin:0;text-align:center;color:#526579;font-size:12px;line-height:1.8;">Open the board to view the latest details and status.<br>ดูรายละเอียดและสถานะล่าสุดบน Display Board</p>
<p style="margin:16px 0 0;color:#526579;font-size:11px;line-height:1.6;overflow-wrap:anywhere;">If the button does not open, use this link:<br><a href="${esc(options.link)}" style="color:#003057;word-break:break-all;">${esc(options.link)}</a></p>
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
    if (!payload?.id || !['event', 'request', 'task'].includes(payload.type) || (payload.type === 'task' ? !['added', 'updated'].includes(payload.changeKind ?? '') : !Array.isArray(payload.departmentIds) || payload.departmentIds.length === 0)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // The recipient is derived from the saved task; callers cannot broaden it.
    let task = null;
    let taskEvent = null;
    let taskSession = null;
    let departmentIds = payload.departmentIds;
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

    const { data: departments, error: departmentError } = await admin
      .from('departments')
      .select('id, code, name_en, emails')
      .in('id', departmentIds);
    if (departmentError) throw departmentError;
    if (!departments?.length) throw new Error('No recipient department found');

    const results: { department: string; emailed: string[]; error?: string }[] = [];

    for (const dept of departments ?? []) {
      let subject = '';
      let html = '';
      let inAppTitle = '';
      let inAppBody = '';
      let eventId: string | null = null;
      let requestId: string | null = null;

      if (payload.type === 'task' && task && taskEvent) {
        const action = payload.changeKind === 'added' ? 'Task added / เพิ่มงาน' : 'Task updated / แก้ไขงาน';
        const fmt = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : '-';
        const plain = (value: string | null) => (value ?? '').replace(/<[^>]*>/g, ' ').trim();
        eventId = taskEvent.id;
        subject = `[${action}] ${task.title} - ${taskEvent.name}`;
        inAppTitle = `${action}: ${task.title}`;
        inAppBody = `${taskEvent.name} · ${taskSession?.title || taskSession?.session_date || taskEvent.event_date} · ${task.title}`;
        html = emailHtml({
          heading: action, eventName: taskEvent.name,
          eventDate: readableDate(taskSession?.session_date || taskEvent.event_date),
          departmentName: dept.name_en,
          campus: taskEvent.campus,
          rows: [
            { label: 'Session', value: taskSession?.title || '-' },
            { label: 'Location', value: task.work_location || taskSession?.location || taskEvent.location || '-' },
            { label: 'Assigned staff', value: task.assigned_staff || '-' },
            { label: 'Start', value: fmt(task.start_time) },
            { label: 'Complete by', value: fmt(task.completion_time) },
            { label: 'Description', value: plain(task.description) || '-' },
            { label: 'Instructions', value: plain(task.instructions) || '-' },
            { label: 'Notes', value: plain(task.notes) || '-' }
          ],
          taskLines: [task.title],
          link: displayLink(taskEvent.campus, 'task', task.id, taskEvent.id)
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
          eventDate: new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          }),
          departmentName: dept.name_en,
          campus: event.campus,
          rows: [
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
          eventDate: new Date(request.request_date + 'T00:00:00').toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          }),
          departmentName: dept.name_en,
          campus: request.campus,
          description: plainText(request.description),
          rows: [
            { label: 'Location', value: request.location || '-' },
            { label: 'Due date', value: readableDate(request.due_date) },
            { label: 'Priority', value: request.priority.charAt(0).toUpperCase() + request.priority.slice(1) },
            { label: 'Reference', value: request.reference || '-' }
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
        kind: payload.type === 'task' ? 'event' : payload.type,
        title: inAppTitle,
        body: inAppBody,
        event_id: eventId,
        request_id: requestId,
        department_id: dept.id,
        email_sent: emailed.length > 0,
        created_by: user.id
      });

      if (recordError) errorMsg = [errorMsg, 'Could not record the in-app notification'].filter(Boolean).join('; ');
      results.push({ department: dept.name_en, emailed, error: errorMsg });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
