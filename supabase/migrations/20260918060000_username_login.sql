-- ============================================================
-- Sign in with a username instead of an email address.
--
-- Not everyone on the team has a school mailbox, so an email address is a poor
-- thing to ask them to remember and type. Supabase Auth always identifies an
-- account by an email, so the email stays underneath: the person types a
-- username, the app looks up the address behind it, and signs in as before.
--
-- Accounts with no real mailbox are given an address at a subdomain that
-- receives no mail. Their password reset links are therefore not sent by
-- Supabase at all; the request-password-reset function mails them to
-- recovery_email, which is the shared address the team actually reads.
--
-- Additive and reversible. Run after 20260918020000_task_notify_state.sql.
-- ============================================================

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists recovery_email text;
alter table public.profiles add column if not exists recovery_sent_at timestamptz;

comment on column public.profiles.username is
  'What this person types to sign in. Case is ignored. Null means they sign in with their email.';
comment on column public.profiles.recovery_email is
  'Where a password reset link is emailed. Null falls back to the shared events mailbox.';

-- One username, however it is capitalised, and blanks are not usernames
create unique index if not exists profiles_username_key
  on public.profiles (lower(username)) where username is not null;

alter table public.profiles drop constraint if exists profiles_username_shape;
alter table public.profiles add constraint profiles_username_shape
  check (username is null or username ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$');

-- ============================================================
-- Turning a username into the address to sign in with.
--
-- The sign-in form needs this before anyone is authenticated, so it is open to
-- anon. It answers one question only, for one exact active username, and
-- returns nothing else about the person. For accounts with no mailbox the
-- answer is an address that receives no mail, so nothing is disclosed at all.
-- ============================================================
create or replace function public_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.email
  from profiles p
  where p.username is not null
    and lower(p.username) = lower(btrim(p_username))
    and p.is_active
  limit 1;
$$;

revoke all on function public_email_for_username(text) from public;
grant execute on function public_email_for_username(text) to anon, authenticated;

-- ============================================================
-- Only an admin sets a username or where a reset link is sent.
--
-- profiles_update_own lets a person edit their own row, so without this the
-- new columns would be theirs to change. The same guard already reverts role,
-- department and is_active for anyone who is not an admin; this adds the three
-- new columns to that list rather than introducing a second mechanism.
-- ============================================================
create or replace function protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editor_role user_role;
begin
  select role into editor_role from profiles where id = auth.uid();
  if editor_role is distinct from 'admin' and auth.uid() is not null then
    new.role = old.role;
    new.department_id = old.department_id;
    new.is_active = old.is_active;
    new.username = old.username;
    new.recovery_email = old.recovery_email;
    new.recovery_sent_at = old.recovery_sent_at;
  end if;
  return new;
end;
$$;

-- ============================================================
-- Rollback (run only to undo this migration)
--   drop function if exists public_email_for_username(text);
--   drop index if exists profiles_username_key;
--   alter table public.profiles drop constraint if exists profiles_username_shape;
--   alter table public.profiles drop column if exists username;
--   alter table public.profiles drop column if exists recovery_email;
--   alter table public.profiles drop column if exists recovery_sent_at;
-- ============================================================
