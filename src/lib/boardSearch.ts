import type { DisplayDepartment, DisplayEvent, DisplayRequest } from '../types';

const text = (values: unknown[]) => values.filter(value => typeof value === 'string').join(' ').replace(/<[^>]*>/g, ' ').normalize('NFKC').toLocaleLowerCase();
const terms = (query: string) => text([query]).trim().split(/\s+/).filter(Boolean);
export function boardMatches(query: string, values: unknown[]): boolean {
  const haystack = text(values);
  return terms(query).every(term => haystack.includes(term));
}
function departmentText(id: string, departments: DisplayDepartment[]): string[] {
  const department = departments.find(item => item.id === id);
  return department ? [department.name_en, department.name_th, department.code] : [];
}
export function searchRequests(requests: DisplayRequest[], query: string, departments: DisplayDepartment[]): DisplayRequest[] {
  return requests.filter(request => boardMatches(query, [request.title, request.reference, request.location, request.description, request.notes, ...departmentText(request.department_id, departments)]));
}
export function searchEvents(events: DisplayEvent[], query: string, departments: DisplayDepartment[]): DisplayEvent[] {
  if (!query.trim()) return events;
  return events.flatMap(event => {
    const eventFields = [event.name, event.location, event.description, event.additional_notes];
    if (boardMatches(query, eventFields)) return [event];
    const tasks = event.tasks.filter(task => {
      const session = event.sessions.find(item => item.id === task.session_id);
      return boardMatches(query, [...eventFields, session?.title, session?.location, session?.note, task.title, task.description, task.notes, task.assigned_staff, task.work_location, task.setup_location, ...departmentText(task.department_id, departments)]);
    });
    const sessions = event.sessions.filter(session => boardMatches(query, [...eventFields, session.title, session.location, session.note]) || tasks.some(task => task.session_id === session.id));
    return tasks.length || sessions.length ? [{ ...event, tasks, sessions }] : [];
  });
}
