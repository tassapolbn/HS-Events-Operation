# Deployment Guide
## Event Operations Management - HeadStart International School

Follow these steps in order. Total time is roughly 30 to 45 minutes.

---

## Part 1: Create the Supabase project (10 minutes)

1. Go to https://supabase.com and sign in (create a free account if needed).
2. Click **New project**.
   - Name: `event-operations`
   - Database password: choose a strong password and store it safely.
   - Region: **Southeast Asia (Singapore)** (closest to Phuket).
3. Wait for the project to finish provisioning.
4. Open **SQL Editor** (left menu) and run the three migration files **in this exact order**. For each one: open the file from `supabase/migrations/`, paste the full contents, press **Run**.
   1. `001_schema.sql` (tables, triggers, audit log)
   2. `002_security.sql` (Row Level Security and storage bucket)
   3. `003_seed.sql` (the four departments with their notification emails)
5. Get your API keys: **Project Settings -> API**. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public** key

---

## Part 2: Create user accounts (5 minutes)

1. Go to **Authentication -> Users -> Add user -> Create new user**.
2. Create your own account first (email + password). Tick **Auto Confirm User**.
3. Make yourself administrator. In **SQL Editor**, run:

```sql
update profiles set role = 'admin' where email = 'your.email@headstartphuket.com';
```

4. Create accounts for the other Events Team members who will use the app
   (same way: Add user, tick Auto Confirm User), then give them access.
   Copy only the SQL (not the ``` lines) into the SQL Editor and run it:

```sql
update profiles set role = 'events_team'
where email in ('events.member1@headstartphuket.com', 'events.member2@headstartphuket.com');
```

**Note about the department emails**: the seven notification addresses
(maintenance.city@, maintenance@, housekeeping.city@, housekeeping@,
security.city@, executivechef@, headchef.city@) do **not** need accounts.
They were already loaded into the database by `003_seed.sql` in Part 1 and
will receive notification emails automatically. Login accounts are only for
people who open the app.

**Optional, for the future**: if one day you want a department to log in and
update its own task status inside the app, create the account and link it to
its department, for example:

```sql
update profiles
set role = 'department_staff',
    department_id = (select id from departments where code = 'maintenance')
where email = 'maintenance@headstartphuket.com';
```

Department codes: `maintenance`, `housekeeping`, `security`, `kitchen`.

---

## Part 3: Email notifications (10 minutes, no IT needed)

Emails are sent through a small **Google Apps Script** running under your own
school Google account. No domain verification, no DNS records, no IT.

### Step A: Create the Apps Script sender

1. Go to https://script.google.com signed in with your school Google account.
2. Click **New project**, delete the sample code, and paste the full contents of
   `supabase/functions/send-notification/apps-script/Code.gs`.
3. In the pasted code, change `SECRET` to your own long random text
   (for example 30+ random letters and numbers). Keep it, you will need it in Step C.
4. Click **Deploy -> New deployment -> gear icon -> Web app** and set:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy**, approve the authorization screens, and **copy the Web app URL**.
6. Optional test: in the editor, run the `testSend` function once.
   A test email should arrive in your own inbox.

Note: "Who has access: Anyone" only means the URL can be called; the SECRET
inside the request is what authorizes sending, and only Supabase knows it.

### Step B: Deploy the Edge Function

1. In the Supabase Dashboard, go to **Edge Functions -> Deploy a new function**
   (or "Create function" via the editor).
2. Name it exactly: `send-notification`
3. Paste the contents of `supabase/functions/send-notification/index.ts` and deploy.

### Step C: Set the function secrets

In **Edge Functions -> Secrets**, add:

| Secret | Value |
|---|---|
| `APPS_SCRIPT_URL` | the Web app URL from Step A |
| `APPS_SCRIPT_SECRET` | the same SECRET text you put in the script |
| `APP_URL` | your Netlify URL, e.g. `https://headstart-events.netlify.app` (you can set this after Part 4) |

Sending limits: Google Workspace accounts can send about 1,500 emails per day
(free Gmail: 100 per day). Both are far beyond what this system needs.

### Alternative for the future: Resend

If the school ever wants emails from a neutral address like
`events@headstartphuket.com` with higher volumes, the function also supports
Resend (https://resend.com). It requires IT to add DNS records once. Set the
secrets `RESEND_API_KEY` and `NOTIFY_FROM` instead of the Apps Script ones.
No code changes are needed; Apps Script is used whenever `APPS_SCRIPT_URL` is set.

---

## Part 4: Deploy to Netlify from GitHub (10 minutes)

1. Create a new GitHub repository and push this project folder to it
   (do not commit `.env`; the included `.gitignore` already excludes it).
2. Go to https://app.netlify.com -> **Add new site -> Import an existing project** -> choose the GitHub repository.
3. Netlify reads `netlify.toml` automatically:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Before the first deploy, add the environment variables
   (**Site configuration -> Environment variables**):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key |

5. Click **Deploy**. When it finishes, copy the site URL and put it into the
   `APP_URL` secret in Part 3 step 5.
6. Optional: set a nicer site name under **Site configuration -> Change site name**.

---

## Part 5: Verify everything works (5 minutes)

1. Open the site, sign in with your admin account.
2. Create a test event, add one task for each department.
3. Upload a floor plan (PDF or image) and preview it inside the app.
4. Press **Send Notification**, select a department, send. Check:
   - The bell icon shows the in-app notification.
   - The department email arrives (sent from your school Gmail account).
   - Tip for a safe first test: temporarily point a department to your own
     email with SQL, then put the real ones back:
     `update departments set emails = array['your.email@headstartphuket.com'] where code = 'maintenance';`
5. (Only if you created department logins) Sign in as a department account:
   you should see the event read-only, be able to update the task status,
   tick checklist items, and add notes.
6. Save the event as a template, then create a new event from that template.
7. Switch language (EN/ไทย) and theme (light/dark) from the top bar.

---

## Everyday administration

- **Add a new user**: Supabase -> Authentication -> Add user, then set role/department with the SQL from Part 2.
- **Change department emails**: `update departments set emails = array['a@x.com','b@x.com'] where code = 'maintenance';`
- **Audit history**: visible at the bottom of every event and request page (Events Team only).
- **Backups**: Supabase free tier keeps daily backups for 7 days; consider the Pro plan for the production term.

## Notes and current limits

- Event times are entered as times of the event day. If breakdown finishes after midnight, enter the deadline as 23:59 and note the real time in the task instructions.
- Office files (DOCX/XLSX) preview uses the Microsoft Office online viewer and requires the file link to be reachable; PDF and images preview natively.
- The database is already prepared for future modules (push notifications, QR checklists, equipment inventory, vehicle booking and more) thanks to UUID keys, soft deletes and the audit trail.
