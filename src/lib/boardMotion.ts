import type { DisplayTask } from '../types';

type TaskContent = Pick<DisplayTask, 'id' | 'title' | 'description' | 'notes' | 'assigned_staff' | 'session_id' | 'department_id'>;

/** Diff the complete feed, before search/department/scope filtering. */
export function changedTaskIds(previous: Map<string, string> | null, events: ReadonlyArray<{ tasks: readonly TaskContent[] }>) {
  const next = new Map<string, string>();
  const changed = new Set<string>();
  for (const event of events) {
    for (const task of event.tasks) {
      // JSON preserves field boundaries even when a title contains a pipe.
      const value = JSON.stringify([task.title, task.description, task.notes, task.assigned_staff, task.session_id, task.department_id]);
      next.set(task.id, value);
      if (previous !== null && previous.get(task.id) !== value) changed.add(task.id);
    }
  }
  return { next, changed };
}

export function sessionLiveState(
  session: { start_time: string | null; end_time: string | null },
  nowMs: number
): { kind: 'live' } | { kind: 'soon'; minutes: number } | null {
  if (!session.start_time || !Number.isFinite(nowMs)) return null;
  const start = Date.parse(session.start_time);
  if (!Number.isFinite(start)) return null;
  const end = session.end_time ? Date.parse(session.end_time) : start + 2 * 60 * 60_000;
  if (!Number.isFinite(end) || end <= start) return null;
  if (start <= nowMs && nowMs < end) return { kind: 'live' };
  const until = start - nowMs;
  return until > 0 && until <= 30 * 60_000 ? { kind: 'soon', minutes: Math.ceil(until / 60_000) } : null;
}
