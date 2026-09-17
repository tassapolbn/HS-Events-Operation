import type { DisplayRequest, DisplaySession, DisplayTask } from '../types';
import { sessionHasEnded } from './sessionVisibility';

/**
 * The board is split in two so that finished work stops competing for attention
 * with work that still has to happen. 'active' is what the departments still
 * have to do; 'done' is everything that is finished, plus every day that has
 * already gone by.
 */
export type BoardScope = 'active' | 'done';

export const BOARD_SCOPE_KEY = 'eventops.display.boardScope';

export function readBoardScope(): BoardScope {
  try {
    return localStorage.getItem(BOARD_SCOPE_KEY) === 'done' ? 'done' : 'active';
  } catch {
    // Storage can be blocked on a shared display; the choice just lasts this visit
    return 'active';
  }
}

/** Work that still has to be done. Cancelled work is settled, not outstanding. */
export function outstandingTasks(tasks: DisplayTask[]): DisplayTask[] {
  return tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled');
}

/**
 * Done means finished, never merely late.
 *
 * Work that is still open stays on the active board however far past its time it
 * is, because that is exactly the work most likely to be missed: a session that
 * ran to 16:00 with two jobs still untouched used to vanish from the board at
 * 16:01, and nobody standing in front of the screen would ever see it again.
 * Once every job on a day is ticked it leaves; a day with no work on it at all
 * leaves once the day itself is over, since there is nothing there to miss.
 */
export function blockIsDone(
  session: Pick<DisplaySession, 'session_date' | 'end_time'> | null,
  fallbackDate: string,
  tasks: DisplayTask[],
  now: number
): boolean {
  if (outstandingTasks(tasks).length > 0) return false;
  if (tasks.length > 0) return true;
  return sessionHasEnded(session ?? { session_date: fallbackDate, end_time: null }, now);
}

/**
 * Open work whose time has already gone. It stays on the active board, and the
 * board says so loudly, so that being late is visible rather than silent.
 */
export function blockIsOverdue(
  session: Pick<DisplaySession, 'session_date' | 'end_time'> | null,
  fallbackDate: string,
  tasks: DisplayTask[],
  now: number
): boolean {
  if (outstandingTasks(tasks).length === 0) return false;
  return sessionHasEnded(session ?? { session_date: fallbackDate, end_time: null }, now);
}

/** A request leaves the active board once it is completed or cancelled. */
export function requestIsDone(request: Pick<DisplayRequest, 'status'>): boolean {
  return request.status === 'completed' || request.status === 'cancelled';
}

/** True when a piece of work belongs in the scope currently being read. */
export function inScope(done: boolean, scope: BoardScope): boolean {
  return scope === 'done' ? done : !done;
}
