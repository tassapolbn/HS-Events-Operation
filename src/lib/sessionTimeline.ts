import type { DisplayEvent, DisplaySession, DisplayTask } from '../types';

/** One globally ordered entry per session, including unassigned event work. */
export function sessionTimeline(events: DisplayEvent[], departmentId = '') {
  const entries: { date: string; event: DisplayEvent; block: { key: string; session: DisplaySession | null; tasks: DisplayTask[] } }[] = [];
  for (const event of events) {
    const tasks = event.tasks.filter(task => !departmentId || task.department_id === departmentId);
    const sessions = event.sessions ?? [];
    const ids = new Set(sessions.map(session => session.id));
    const general = tasks.filter(task => !task.session_id || !ids.has(task.session_id));
    if (general.length || (!sessions.length && !departmentId)) {
      entries.push({ date: event.event_date, event, block: { key: `${event.id}-general`, session: null, tasks: general } });
    }
    for (const session of sessions) {
      const sessionTasks = tasks.filter(task => task.session_id === session.id);
      if (departmentId && !sessionTasks.length) continue;
      entries.push({ date: session.session_date, event, block: { key: session.id, session, tasks: sessionTasks } });
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date)
    || (a.block.session?.start_time ? Date.parse(a.block.session.start_time) : Infinity) - (b.block.session?.start_time ? Date.parse(b.block.session.start_time) : Infinity)
    || a.event.name.localeCompare(b.event.name)
    || (a.block.session?.sort_order ?? 0) - (b.block.session?.sort_order ?? 0)
    || a.block.key.localeCompare(b.block.key));
}
