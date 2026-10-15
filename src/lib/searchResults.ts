/**
 * The top bar search: what the database returns, turned into one list that
 * the arrow keys can walk through, each line knowing where it leads.
 * No React or Supabase in here, so the rules can be tested on their own.
 */

export interface SearchResponse {
  events: Array<{ id: string; name: string; event_date: string; campus: string; location: string; status: string; archived: boolean }>;
  tasks: Array<{
    id: string; title: string; event_id: string; event_name: string; event_date: string; campus: string;
    department_id: string; status: string; assigned_staff: string; archived: boolean;
  }>;
  requests: Array<{
    id: string; title: string; reference: string; request_date: string; due_date: string | null; campus: string;
    department_id: string; status: string; location: string; archived: boolean;
  }>;
  contacts: Array<{ id: string; name: string; role: string; phone: string; email: string }>;
  people: Array<{ id: string; full_name: string; email: string; role: string; department_id: string | null }>;
}

export type SearchGroup = 'events' | 'tasks' | 'requests' | 'contacts' | 'people';

export const SEARCH_GROUPS: SearchGroup[] = ['events', 'tasks', 'requests', 'contacts', 'people'];

export interface SearchHit {
  key: string;
  group: SearchGroup;
  id: string;
  title: string;
  /** Short facts under the title: date, event, department, role */
  date?: string | null;
  context?: string;
  campus?: string;
  departmentId?: string | null;
  archived?: boolean;
  phone?: string;
  email?: string;
  /** Where Enter or a click goes; null when the line only shows information */
  href: string | null;
}

export const EMPTY_SEARCH: SearchResponse = { events: [], tasks: [], requests: [], contacts: [], people: [] };

/** Shortest search the database answers */
export const MIN_SEARCH_LENGTH = 2;

export function searchable(query: string): boolean {
  return query.trim().length >= MIN_SEARCH_LENGTH;
}

/**
 * Every result in display order. People lead to the Users page for admins,
 * who manage accounts; for everyone else they are information only.
 */
export function flattenSearch(response: SearchResponse | null | undefined, options: { isAdmin: boolean }): SearchHit[] {
  const data = { ...EMPTY_SEARCH, ...(response ?? {}) };
  const hits: SearchHit[] = [];
  for (const event of data.events) {
    hits.push({
      key: `events:${event.id}`, group: 'events', id: event.id, title: event.name, date: event.event_date,
      context: event.location, campus: event.campus, archived: event.archived, href: `/events/${event.id}`
    });
  }
  for (const task of data.tasks) {
    hits.push({
      key: `tasks:${task.id}`, group: 'tasks', id: task.id, title: task.title, date: task.event_date,
      context: [task.event_name, task.assigned_staff].filter(Boolean).join(' · '), campus: task.campus,
      departmentId: task.department_id, archived: task.archived,
      href: `/events/${task.event_id}?task=${encodeURIComponent(task.id)}`
    });
  }
  for (const request of data.requests) {
    hits.push({
      key: `requests:${request.id}`, group: 'requests', id: request.id, title: request.title,
      date: request.due_date ?? request.request_date, context: [request.reference, request.location].filter(Boolean).join(' · '),
      campus: request.campus, departmentId: request.department_id, archived: request.archived, href: `/requests/${request.id}`
    });
  }
  for (const contact of data.contacts) {
    hits.push({
      key: `contacts:${contact.id}`, group: 'contacts', id: contact.id, title: contact.name, context: contact.role,
      phone: contact.phone, email: contact.email, href: `/contacts?q=${encodeURIComponent(contact.name)}`
    });
  }
  for (const person of data.people) {
    hits.push({
      key: `people:${person.id}`, group: 'people', id: person.id, title: person.full_name, departmentId: person.department_id,
      email: person.email, href: options.isAdmin ? `/users?q=${encodeURIComponent(person.full_name)}` : null
    });
  }
  return hits;
}

/** The next line the arrow keys land on, skipping lines that lead nowhere and wrapping around */
export function moveSelection(hits: SearchHit[], current: number, step: 1 | -1): number {
  if (hits.length === 0) return -1;
  // Nothing chosen yet: down starts at the top, up at the bottom
  const start = current < 0 ? (step === 1 ? -1 : 0) : current;
  for (let tries = 1; tries <= hits.length; tries += 1) {
    const next = (((start + step * tries) % hits.length) + hits.length) % hits.length;
    if (hits[next].href) return next;
  }
  return -1;
}
