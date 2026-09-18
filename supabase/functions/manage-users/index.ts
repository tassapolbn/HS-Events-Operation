// Supabase Edge Function: manage-users
//
// Creating an account, setting a password and locking someone out all need the
// service role, which must never reach a browser. Everything else about a
// person (their role, department, username) is an ordinary row that an admin
// already edits through row level security, so only these three live here.
//
// Only an admin may call it, and an admin may not lock, demote or delete their
// own account: the one thing worse than no account management is a school with
// nobody who can get in.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/** Accounts with no mailbox of their own get an address here. It receives no mail. */
const USERNAME_EMAIL_DOMAIN = Deno.env.get('USERNAME_EMAIL_DOMAIN') ?? 'login.headstartphuket.com';

const ROLES = ['admin', 'events_team', 'department_manager', 'department_staff'];
const USERNAME_SHAPE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;

interface Payload {
  action: 'list' | 'create' | 'set_password' | 'set_active' | 'delete';
  id?: string;
  full_name?: string;
  username?: string;
  email?: string;
  role?: string;
  department_id?: string | null;
  recovery_email?: string | null;
  password?: string;
  is_active?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!me || me.role !== 'admin') return json({ error: 'Only an admin can manage accounts' }, 403);

    const payload = (await req.json()) as Payload;

    // ---------- who there is ----------
    if (payload.action === 'list') {
      const { data: profiles, error } = await admin
        .from('profiles')
        .select('id, email, username, full_name, role, department_id, is_active, recovery_email, created_at')
        .order('full_name');
      if (error) throw error;
      // When someone last got in is the question an admin actually asks, and it
      // lives on the auth side rather than on the profile.
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const seen = new Map(
        (listed.data?.users ?? []).map((item) => [item.id, item.last_sign_in_at ?? null])
      );
      return json({
        users: (profiles ?? []).map((item) => ({ ...item, last_sign_in_at: seen.get(item.id) ?? null }))
      });
    }

    // ---------- a new account ----------
    if (payload.action === 'create') {
      const fullName = (payload.full_name ?? '').trim();
      const username = (payload.username ?? '').trim();
      const typedEmail = (payload.email ?? '').trim().toLowerCase();
      const password = payload.password ?? '';
      const role = payload.role ?? 'department_staff';

      if (!fullName) return json({ error: 'A name is required' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Unknown role' }, 400);
      if (password.length < 8) return json({ error: 'The password must be at least 8 characters' }, 400);
      if (!username && !typedEmail) return json({ error: 'A username or an email is required' }, 400);
      if (username && !USERNAME_SHAPE.test(username)) {
        return json({ error: 'A username is 3 to 32 letters, digits, dot, dash or underscore' }, 400);
      }

      if (username) {
        const clash = await admin.from('profiles').select('id').ilike('username', username).limit(1);
        if ((clash.data ?? []).length > 0) return json({ error: 'That username is taken' }, 409);
      }

      // No mailbox of their own means an address that receives no mail, so the
      // reset link has to be sent by us rather than by Supabase.
      const email = typedEmail || `${username.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;

      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (created.error || !created.data.user) {
        return json({ error: created.error?.message ?? 'Could not create the account' }, 400);
      }

      // handle_new_user has already written the row; fill in the rest
      const saved = await admin
        .from('profiles')
        .update({
          full_name: fullName,
          username: username || null,
          role,
          department_id: payload.department_id ?? null,
          recovery_email: (payload.recovery_email ?? '').trim() || null,
          is_active: true
        })
        .eq('id', created.data.user.id)
        .select()
        .single();
      if (saved.error) {
        // Never leave an account that can sign in but has no profile behind it
        await admin.auth.admin.deleteUser(created.data.user.id);
        return json({ error: 'Could not save the profile' }, 500);
      }
      return json({ ok: true, user: saved.data });
    }

    // ---------- everything past here names somebody else ----------
    const targetId = (payload.id ?? '').trim();
    if (!targetId) return json({ error: 'Which account?' }, 400);
    if (targetId === user.id && payload.action !== 'set_password') {
      return json({ error: 'You cannot lock or delete your own account' }, 400);
    }

    if (payload.action === 'set_password') {
      const password = payload.password ?? '';
      if (password.length < 8) return json({ error: 'The password must be at least 8 characters' }, 400);
      const updated = await admin.auth.admin.updateUserById(targetId, { password });
      if (updated.error) return json({ error: updated.error.message }, 400);
      return json({ ok: true });
    }

    if (payload.action === 'set_active') {
      const active = payload.is_active === true;
      // The profile flag is what the app reads; the ban is what actually stops
      // a session being issued, so somebody who has left is really out.
      const banned = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: active ? 'none' : '876000h'
      });
      if (banned.error) return json({ error: banned.error.message }, 400);
      const saved = await admin.from('profiles').update({ is_active: active }).eq('id', targetId);
      if (saved.error) throw saved.error;
      return json({ ok: true });
    }

    if (payload.action === 'delete') {
      const removed = await admin.auth.admin.deleteUser(targetId);
      if (removed.error) return json({ error: removed.error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
