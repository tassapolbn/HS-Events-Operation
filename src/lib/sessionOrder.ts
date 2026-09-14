import type { EventSession } from '../types';

type Orderable = Pick<EventSession, 'session_date' | 'sort_order'>;

/** Sessions as the whole app reads them: earliest day first, then the order the admin chose. */
export function sortSessions<T extends Orderable>(sessions: T[]): T[] {
  return [...sessions].sort(
    (a, b) => a.session_date.localeCompare(b.session_date) || a.sort_order - b.sort_order
  );
}

/**
 * Move one session up or down inside its own day.
 *
 * Two sessions can run at the same time, so the admin decides which one to put
 * first. The day itself is never negotiable: a session on an earlier date always
 * stays above one on a later date, which is why the move only ever reshuffles
 * the sessions that share a date.
 *
 * Returns only the rows whose sort_order actually has to be written, so a
 * session already at the top or bottom of its day writes nothing at all.
 */
export function reorderWithinDay(
  sessions: EventSession[],
  id: string,
  direction: -1 | 1
): Array<{ id: string; sort_order: number }> {
  const session = sessions.find((item) => item.id === id);
  if (!session) return [];
  const day = sortSessions(sessions.filter((item) => item.session_date === session.session_date));
  const index = day.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= day.length) return [];

  const moved = [...day];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  const current = new Map(day.map((item) => [item.id, item.sort_order]));
  return moved
    .map((item, order) => ({ id: item.id, sort_order: order }))
    .filter((row) => current.get(row.id) !== row.sort_order);
}

/** Whether the move is available, so the button can be disabled at the edges of a day. */
export function canReorder(sessions: EventSession[], id: string, direction: -1 | 1): boolean {
  return reorderWithinDay(sessions, id, direction).length > 0;
}
