import type { DisplayEvent, DisplaySession, DisplayTask } from '../types';

type Block = { key: string; session: DisplaySession | null; tasks: DisplayTask[] };
type Entry = { date: string; event: DisplayEvent; block: Block };

/** When a session starts, or null when the admin left the time blank. */
function startedAt(session: DisplaySession | null): number | null {
  if (!session?.start_time) return null;
  const ms = Date.parse(session.start_time);
  return Number.isNaN(ms) ? null : ms;
}

/** Infinity minus Infinity is NaN, so never subtract one anchor from another. */
function compareAnchor(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * One globally ordered entry per session, including unassigned event work.
 *
 * The clock decides the reading order of a day only where the clock can decide
 * it. Whenever one of an event's sessions on that day carries no start time,
 * the whole of that event's day follows the order the admin set in the
 * worksheet instead. Otherwise an untimed session is thrown to the end of the
 * day, away from the work it belongs with, and a department reading the board
 * meets "After Event" before the set-up it follows.
 *
 * That order is read straight from the sessions as they arrive, which is the
 * order the database hands back: date, then the admin's sort_order, then the
 * moment the session was created. Reading it rather than sorting on sort_order
 * again is what keeps the board and the worksheet in step even when two
 * sessions on one day happen to share a sort_order.
 *
 * Every entry is given its place before the sort runs, so the comparison is a
 * plain tuple and can never contradict itself. Folding a per event rule into
 * the pairwise comparison instead would let three sessions form a loop, and a
 * sort fed a comparator that loops scrambles the whole day.
 */
export function sessionTimeline(events: DisplayEvent[], departmentId = '') {
  const entries: Entry[] = [];
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

  // One event's blocks on one day belong together, so they are ranked together.
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = `${entry.date} ${entry.event.id}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  /** Where an entry sits in the day */
  const anchor = new Map<Entry, number>();
  /** Where it sits inside its own event's part of that day */
  const rank = new Map<Entry, number>();

  for (const group of groups.values()) {
    const times = group.map(entry => startedAt(entry.block.session));
    const everyTimed = times.every(time => time !== null);
    const known = times.filter((time): time is number => time !== null);
    // With a time missing the group travels as one, anchored to its earliest
    // known start, or to the end of the day when it has no time at all.
    const shared = known.length ? Math.min(...known) : Number.POSITIVE_INFINITY;
    group.forEach((entry, index) => {
      anchor.set(entry, everyTimed ? (startedAt(entry.block.session) as number) : shared);
      rank.set(entry, index);
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date)
    || compareAnchor(anchor.get(a) ?? Number.POSITIVE_INFINITY, anchor.get(b) ?? Number.POSITIVE_INFINITY)
    || a.event.name.localeCompare(b.event.name)
    || (rank.get(a) ?? 0) - (rank.get(b) ?? 0)
    || a.block.key.localeCompare(b.block.key));
}
