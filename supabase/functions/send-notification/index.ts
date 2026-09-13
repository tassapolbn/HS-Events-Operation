// Supabase Edge Function: send-notification
// Sends department notification emails via Resend and records
// in-app notifications. Only the Events Team / Admin may call it.
//
// Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY   - from https://resend.com
//   NOTIFY_FROM      - e.g. "HeadStart Events <onboarding@resend.dev>"
//   APP_URL          - e.g. https://your-site.netlify.app

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

function emailHtml(options: {
  heading: string;
  eventName: string;
  eventDate: string;
  departmentName: string;
  rows: { label: string; value: string }[];
  taskLines: string[];
  link: string;
}): string {
  const detailRows = options.rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;white-space:nowrap;">${esc(r.label)}</td>` +
        `<td style="padding:6px 12px;color:#0f172a;font-size:13px;">${esc(r.value)}</td></tr>`
    )
    .join('');
  const tasks = options.taskLines
    .map((t) => `<li style="margin:4px 0;color:#0f172a;font-size:14px;">${esc(t)}</li>`)
    .join('');
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Sarabun',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 12px;">
  <div style="background:#1a3c5e;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
    <div style="color:#F0B323;font-size:12px;letter-spacing:2px;text-transform:uppercase;">HeadStart International School</div>
    <div style="color:#ffffff;font-size:22px;font-weight:bold;margin-top:6px;">${esc(options.heading)}</div>
  </div>
  <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;">
    <div style="font-size:18px;font-weight:bold;color:#0f172a;">${esc(options.eventName)}</div>
    <div style="color:#64748b;font-size:13px;margin-top:2px;">${esc(options.eventDate)} &bull; ${esc(options.departmentName)}</div>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#f8fafc;border-radius:8px;">${detailRows}</table>
    ${tasks ? `<div style="margin-top:16px;font-weight:bold;color:#1a3c5e;font-size:14px;">Task summary</div><ul style="padding-left:20px;margin:8px 0;">${tasks}</ul>` : ''}
    <div style="text-align:center;margin-top:24px;">
      <a href="${options.link}" style="background:#F0B323;color:#1a3c5e;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:8px;display:inline-block;font-size:14px;">Open in Event Operations</a>
    </div>
    <div style="color:#94a3b8;font-size:11px;text-align:center;margin-top:20px;">This is an automated notification from the Event Operations system.</div>
  </div>
</div>
</body></html>`;
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
    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

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
          eventDate: taskSession?.session_date || taskEvent.event_date,
          departmentName: dept.name_en,
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
          link: `${appUrl}/events/${taskEvent.id}?task=${encodeURIComponent(task.id)}`
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
          rows: [
            { label: 'Location', value: event.location || '-' },
            { label: 'Setup start', value: fmtTime(event.setup_start) },
            { label: 'Venue ready', value: fmtTime(event.venue_ready) },
            { label: 'Event time', value: `${fmtTime(event.event_start)} to ${fmtTime(event.event_finish)}` },
            { label: 'Breakdown', value: `${fmtTime(event.breakdown_start)} to ${fmtTime(event.breakdown_deadline)}` },
            { label: 'Priority', value: event.priority }
          ],
          taskLines: (tasks ?? []).map((t) => t.title),
          link: `${appUrl}/events/${event.id}`
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
          rows: [
            { label: 'Location', value: request.location || '-' },
            { label: 'Due date', value: request.due_date ?? '-' },
            { label: 'Priority', value: request.priority },
            { label: 'Reference', value: request.reference || '-' }
          ],
          taskLines: [],
          link: `${appUrl}/requests/${request.id}`
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
