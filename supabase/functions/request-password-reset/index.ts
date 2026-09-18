// Supabase Edge Function: request-password-reset
//
// Sends a password reset link for an account that signs in with a username.
// Those accounts have no mailbox of their own, so Supabase cannot email them:
// this generates the recovery link with the service role and sends it, through
// the same Google Apps Script transport the notifications already use, to the
// shared address the team actually reads.
//
// Called by anyone who is signed out, so it says the same thing whatever
// happens: never whether an account exists, never where the link was sent.
//
// Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   APPS_SCRIPT_URL, APPS_SCRIPT_SECRET  - the transport, already set up
//   APP_URL                              - e.g. https://hs-opt.netlify.app
//   DEFAULT_RECOVERY_EMAIL               - where a reset goes when the account
//                                          has no recovery_email of its own

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/** One reset per account per minute, so the shared inbox cannot be flooded. */
const THROTTLE_MS = 60_000;

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resetEmailHtml(options: { username: string; fullName: string; link: string; appUrl: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EDF2F7;font-family:Arial,Tahoma,sans-serif;color:#003057;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDF2F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #DCE4EC;border-radius:16px;overflow:hidden;">
<tr><td style="background:#003057;border-top:5px solid #F0B323;padding:24px 28px;">
<p style="margin:0;color:#FFFFFF;font-size:22px;font-weight:bold;">HeadStart <span style="color:#F0B323;">Event Operations</span></p>
</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 12px;color:#526579;font-size:12px;font-weight:bold;">PASSWORD RESET / ตั้งรหัสผ่านใหม่</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;color:#003057;">${esc(options.username)}</h1>
${options.fullName ? `<p style="margin:0 0 16px;font-size:15px;color:#526579;">${esc(options.fullName)}</p>` : ''}
<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#243B53;">
Somebody asked to reset the password for this account. Open the link below to choose a new one. It can be used once, and it stops working after an hour.<br><br>
มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ ใช้ได้ครั้งเดียวและหมดอายุใน 1 ชั่วโมง</p>
<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:24px auto;"><tr><td bgcolor="#F0B323" style="border-radius:8px;text-align:center;">
<a href="${esc(options.link)}" style="display:inline-block;padding:16px 24px;border-radius:8px;color:#003057;font-size:15px;font-weight:bold;text-decoration:none;">Set a new password / ตั้งรหัสผ่านใหม่</a>
</td></tr></table>
<p style="margin:0;text-align:center;color:#526579;font-size:12px;line-height:1.8;">
If nobody asked for this, ignore this email. The password does not change until the link is opened.<br>
ถ้าไม่ได้เป็นคนขอ ไม่ต้องทำอะไร รหัสผ่านจะยังไม่เปลี่ยนจนกว่าจะกดลิงก์</p>
</td></tr>
<tr><td style="padding:18px 28px;background:#F5F8FB;border-top:1px solid #E5EAF0;color:#526579;font-size:11px;line-height:1.7;text-align:center;">
${esc(options.appUrl)}<br>Automated message / ข้อความอัตโนมัติ</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // The same answer every time, so this can never be used to find out who has
  // an account here or which address a reset would reach.
  const same = () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appsScriptUrl = Deno.env.get('APPS_SCRIPT_URL') ?? '';
    const appsScriptSecret = Deno.env.get('APPS_SCRIPT_SECRET') ?? '';
    const appUrl = (Deno.env.get('APP_URL') ?? 'https://hs-opt.netlify.app').replace(/\/+$/, '');
    const fallbackRecovery = Deno.env.get('DEFAULT_RECOVERY_EMAIL') ?? '';

    const body = (await req.json().catch(() => null)) as { login?: string } | null;
    const login = (body?.login ?? '').trim();
    if (!login || login.length > 320) return same();

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Whatever they typed, find the one active account it names
    const byUsername = !login.includes('@');
    const found = await admin
      .from('profiles')
      .select('id, email, username, full_name, recovery_email, recovery_sent_at, is_active')
      .eq(byUsername ? 'username' : 'email', login)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    const profile = found.data as
      | { id: string; email: string; username: string | null; full_name: string; recovery_email: string | null; recovery_sent_at: string | null }
      | null;
    if (!profile) return same();

    const last = profile.recovery_sent_at ? Date.parse(profile.recovery_sent_at) : 0;
    if (Number.isFinite(last) && Date.now() - last < THROTTLE_MS) return same();

    // Where it goes is decided here, never by the caller
    const to = (profile.recovery_email || fallbackRecovery || '').trim();
    if (!to) return same();

    const generated = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: { redirectTo: `${appUrl}/reset-password` }
    });
    const link = generated.data?.properties?.action_link;
    if (generated.error || !link) return same();

    // Stamp before sending, so a failure cannot be retried in a tight loop
    await admin.from('profiles').update({ recovery_sent_at: new Date().toISOString() }).eq('id', profile.id);

    if (appsScriptUrl) {
      await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: appsScriptSecret,
          to: [to],
          subject: `[Password reset / ตั้งรหัสผ่านใหม่] ${profile.username || profile.email}`,
          html: resetEmailHtml({
            username: profile.username || profile.email,
            fullName: profile.full_name ?? '',
            link,
            appUrl
          })
        })
      }).catch(() => null);
    }

    return same();
  } catch {
    // Even a failure says the same thing, for the same reason
    return same();
  }
});
