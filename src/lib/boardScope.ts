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
 * A day of work is done once it is over, or once every task on it is ticked.
 * A day that has passed counts as done even with work left open on it: that day
 * cannot be worked any more, so Done lists it for follow up instead of leaving
 * it in the way of the work that is still live.
 */
export function blockIsDone(
  session: Pick<DisplaySession, 'session_date' | 'end_time'> | null,
  fallbackDate: string,
  tasks: DisplayTask[],
  now: number
): boolean {
  if (sessionHasEnded(session ?? { session_date: fallbackDate, end_time: null }, now)) return true;
  return tasks.length > 0 && outstandingTasks(tasks).length === 0;
}

/** A request leaves the active board once it is completed or cancelled. */
export function requestIsDone(request: Pick<DisplayRequest, 'status'>): boolean {
  return request.status === 'completed' || request.status === 'cancelled';
}

/** True when a piece of work belongs in the scope currently being read. */
export function inScope(done: boolean, scope: BoardScope): boolean {
  return scope === 'done' ? done : !done;
}
