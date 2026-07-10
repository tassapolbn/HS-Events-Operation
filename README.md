# Event Operations Management

A modern, bilingual (English/Thai) web application for HeadStart International School, Phuket. It digitizes the Events Department workflow: creating events, assigning tasks to departments, sending notifications, tracking progress, and handling general department job requests.

## Features

- **Event Operations**: one event, tasks for every department (Maintenance & Gardener, Housekeeping, Security & Driver, Kitchen / Food Service), all visible on a single screen with color coded, collapsible sections.
- **General Department Requests**: standalone job requests sent to one selected department (the digital version of the EVENT JOB REQUEST sheet, including Reference and Head Responsible fields).
- **Event Timeline**: Setup Begins, Venue Ready, Event Starts, Event Ends, Breakdown Begins, Breakdown Complete.
- **Notifications**: in-app notification feed plus notification emails per department via a Supabase Edge Function, delivered from the school Gmail account through Google Apps Script (no domain setup needed), with Resend supported as an alternative.
- **Templates**: save any event as a reusable template (tasks, schedule, instructions, checklists, optional attachments) and create new events from it in seconds.
- **Attachments**: PDF, PNG, JPG, DOCX, XLSX with in-app preview (images and PDF natively, Office files via Microsoft Office viewer).
- **Rich text** everywhere it matters: bold, italic, underline, lists, alignment, links.
- **Dashboard**: today's events, upcoming events, department workload, pending/completed counters, recent activity.
- **Calendar**: month, week, and day views.
- **Search and filters**: by name, department, location, status, priority, date range, assigned staff.
- **Audit history**: every create/update/delete recorded with user, time, previous and updated values.
- **Roles and permissions** enforced with Supabase Row Level Security: Admin, Events Team, Department Manager, Department Staff.
- **Light and dark mode**, responsive from mobile to desktop, Thai displayed in the Sarabun font.

## Technology

React 18, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, React Hook Form, TipTap, Supabase (Auth, PostgreSQL, Storage, Edge Functions, RLS), deployed as a static site on Netlify.

## Project structure

```
supabase/
  migrations/        SQL to run in the Supabase SQL Editor (001, 002, 003 in order)
  functions/
    send-notification/  Edge Function that emails departments via Resend
src/
  components/        UI library, layout, editor, attachments, event components
  contexts/          Auth and Theme providers
  hooks/             Data hooks (TanStack Query + Supabase)
  i18n/              English and Thai dictionaries + language provider
  lib/               Supabase client, constants, utilities
  pages/             Route pages
```

## Local development

1. `cp .env.example .env` and fill in your Supabase URL and anon key.
2. `npm install`
3. `npm run dev`

## Production build

`npm run build` (TypeScript check + Vite build, output in `dist/`).

See **DEPLOYMENT_GUIDE.md** for the complete step-by-step setup (Supabase, Resend, Netlify).
