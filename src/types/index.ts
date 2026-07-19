// Shared application types matching the Supabase schema

export type UserRole = 'admin' | 'events_team' | 'department_manager' | 'department_staff';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type EventStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'archived';
export type TaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'waiting'
  | 'completed'
  | 'cancelled'
  | 'new'
  | 'acknowledged'
  | 'needs_revision';
export type EntityType = 'event' | 'event_task' | 'request' | 'template';

export interface Department {
  id: string;
  code: string;
  name_en: string;
  name_th: string;
  color: string;
  icon: string;
  emails: string[];
  sort_order: number;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  preferred_language: string;
  is_active: boolean;
}

export interface EventRow {
  id: string;
  name: string;
  category: string;
  event_date: string;
  location: string;
  setup_start: string | null;
  venue_ready: string | null;
  event_start: string | null;
  event_finish: string | null;
  breakdown_start: string | null;
  breakdown_deadline: string | null;
  /** Optional free text timing, e.g. "after school time". Shown beside the clock time. */
  setup_start_note: string;
  venue_ready_note: string;
  event_start_note: string;
  event_finish_note: string;
  breakdown_start_note: string;
  breakdown_deadline_note: string;
  description: string;
  additional_notes: string;
  internal_notes: string;
  priority: Priority;
  status: EventStatus;
  header_color: string;
  header_text_color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventSession {
  id: string;
  event_id: string;
  title: string;
  session_date: string;
  location: string;
  start_time: string | null;
  end_time: string | null;
  /** Optional free text timing, e.g. "after school time". Shown beside the times. */
  time_note: string;
  sort_order: number;
}

export interface EventTask {
  id: string;
  event_id: string;
  department_id: string;
  session_id: string | null;
  title: string;
  description: string;
  instructions: string;
  work_location: string;
  setup_location: string;
  assigned_staff: string;
  start_time: string | null;
  completion_time: string | null;
  priority: Priority;
  status: TaskStatus;
  notes: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  label: string;
  is_done: boolean;
  done_by: string | null;
  done_at: string | null;
  sort_order: number;
}

export interface DepartmentRequest {
  id: string;
  department_id: string;
  title: string;
  reference: string;
  head_responsible: string;
  location: string;
  request_date: string;
  due_date: string | null;
  priority: Priority;
  status: TaskStatus;
  description: string;
  notes: string;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Attachment {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface EventTemplate {
  id: string;
  name: string;
  description: string;
  data: TemplateData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateData {
  event: {
    name: string;
    category: string;
    location: string;
    description: string;
    additional_notes: string;
    internal_notes: string;
    priority: Priority;
    times: Record<string, string | null>; // HH:mm per milestone field
  };
  tasks: Array<{
    department_code: string;
    title: string;
    description: string;
    instructions: string;
    work_location: string;
    setup_location: string;
    assigned_staff: string;
    priority: Priority;
    start_time: string | null; // HH:mm
    completion_time: string | null; // HH:mm
    checklist: string[];
  }>;
  attachments: Array<{
    file_name: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  }>;
}

export interface AppNotification {
  id: string;
  kind: 'event' | 'request' | 'system';
  title: string;
  body: string;
  event_id: string | null;
  request_id: string | null;
  department_id: string | null;
  email_sent: boolean;
  created_by: string | null;
  created_at: string;
  read?: boolean;
}

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  created_at: string;
  changed_by_profile?: { full_name: string } | null;
}

export interface EventWithTasks extends EventRow {
  event_tasks: EventTask[];
  event_sessions: EventSession[];
}

// ---------- Public display board types (returned by RPC functions) ----------

export interface DisplayAttachment {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
}

export interface DisplaySession {
  id: string;
  title: string;
  session_date: string;
  location: string;
  start_time: string | null;
  end_time: string | null;
  /** Optional free text timing, e.g. "after school time". Shown beside the times. */
  time_note: string;
  sort_order: number;
}

export interface DisplayTask {
  id: string;
  department_id: string;
  session_id: string | null;
  title: string;
  description: string;
  work_location: string;
  setup_location: string;
  assigned_staff: string;
  start_time: string | null;
  completion_time: string | null;
  status: TaskStatus;
  notes: string;
  attachments: DisplayAttachment[];
}

export interface DisplayEvent {
  id: string;
  name: string;
  category: string;
  event_date: string;
  location: string;
  setup_start: string | null;
  venue_ready: string | null;
  event_start: string | null;
  event_finish: string | null;
  breakdown_start: string | null;
  breakdown_deadline: string | null;
  /** Optional free text timing, e.g. "after school time". Shown beside the clock time. */
  setup_start_note: string;
  venue_ready_note: string;
  event_start_note: string;
  event_finish_note: string;
  breakdown_start_note: string;
  breakdown_deadline_note: string;
  description: string;
  additional_notes: string;
  status: EventStatus;
  header_color: string;
  header_text_color: string;
  sessions: DisplaySession[];
  attachments: DisplayAttachment[];
  tasks: DisplayTask[];
}

export interface DisplayRequest {
  id: string;
  department_id: string;
  title: string;
  reference: string;
  location: string;
  request_date: string;
  due_date: string | null;
  priority: Priority;
  status: TaskStatus;
  description: string;
  notes: string;
  attachments: DisplayAttachment[];
}

export interface DisplayDepartment {
  id: string;
  code: string;
  name_en: string;
  name_th: string;
  color: string;
  icon: string;
  sort_order: number;
}
