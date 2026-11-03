import type { EventSession, EventTask } from '../types';

export type EventCheckWarning = 'no-jobs' | 'no-time' | 'no-place' | 'hidden';
export interface EventCheckCounts {
  total: number;
  done: number;
  acknowledged: number;
}
export interface EventCheckBlock {
  key: string;
  sessionId: string | null;
  date: string;
  counts: Record<string, EventCheckCounts>;
  warnings: EventCheckWarning[];
}

interface EventCheckInput {
  event_date: string;
  sessions: Pick<EventSession, 'id' | 'session_date' | 'start_time' | 'end_time' | 'time_note' | 'location' | 'is_hidden' | 'sort_order'>[];
  tasks: Pick<EventTask, 'session_id' | 'department_id' | 'status' | 'acknowledged_at' | 'deleted_at'>[];
}

/** Count all jobs, including hidden sessions, so preparation gaps remain visible. */
export function eventCheck({ event_date, sessions, tasks }: EventCheckInput, departmentIds: string[]) {
  const emptyCounts = (): Record<string, EventCheckCounts> => Object.fromEntries(
    departmentIds.map((id) => [id, { total: 0, done: 0, acknowledged: 0 }])
  );
  const totals = emptyCounts();
  const blocks: EventCheckBlock[] = [...sessions]
    .sort((a, b) => a.session_date.localeCompare(b.session_date) || a.sort_order - b.sort_order)
    .map((session) => ({
      key: `session:${session.id}`,
      sessionId: session.id,
      date: session.session_date,
      counts: emptyCounts(),
      warnings: [
        ...(!session.start_time && !session.end_time && !session.time_note?.trim() ? ['no-time' as const] : []),
        ...(!session.location?.trim() ? ['no-place' as const] : []),
        ...(session.is_hidden ? ['hidden' as const] : [])
      ]
    }));
  const bySession = new Map(blocks.map((block) => [block.sessionId, block]));
  const wholeEvent: EventCheckBlock = {
    key: 'whole-event', sessionId: null, date: event_date, counts: emptyCounts(), warnings: []
  };
  const populated = new Set<EventCheckBlock>();

  for (const task of tasks) {
    if (task.deleted_at) continue;
    // Match the worksheet: a job whose session no longer exists belongs to the whole event.
    const block = bySession.get(task.session_id) ?? wholeEvent;
    populated.add(block);
    for (const counts of [block.counts, totals]) {
      const count = counts[task.department_id];
      if (!count) continue;
      count.total++;
      if (task.status === 'completed') count.done++;
      else if (task.acknowledged_at) count.acknowledged++;
    }
  }
  for (const block of blocks) {
    if (!populated.has(block)) block.warnings.unshift('no-jobs');
  }
  if (populated.has(wholeEvent)) blocks.push(wholeEvent);
  return { blocks, totals };
}
