import type { DisplayEvent, DisplayTask } from '../types';
import { sessionTimeline } from './sessionTimeline.ts';

function openCounts(tasks: DisplayTask[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    if (task.status !== 'completed') counts[task.department_id] = (counts[task.department_id] ?? 0) + 1;
  }
  return counts;
}

/** Count today's work across sessions and the whole-event block, once per job. */
export function openJobsByDepartment(events: DisplayEvent[], today: string): Record<string, number> {
  return openCounts(sessionTimeline(events).filter(entry => entry.date === today).flatMap(entry => entry.block.tasks));
}

export interface TodaySession {
  key: string;
  eventName: string;
  sessionTitle: string;
  location: string;
  startTime: string;
  endTime: string | null;
  openCounts: Record<string, number>;
}

export interface NowAndNext {
  now: TodaySession[];
  next: (TodaySession & { minutes: number }) | null;
}

/** Only timed sessions on the school day participate; overlapping sessions all stay visible. */
export function nowAndNext(events: DisplayEvent[], nowMs: number, today: string): NowAndNext {
  const result: NowAndNext = { now: [], next: null };
  const entries = sessionTimeline(events)
    .filter(entry => entry.date === today && entry.block.session?.start_time)
    .sort((a, b) => Date.parse(a.block.session!.start_time!) - Date.parse(b.block.session!.start_time!));
  for (const { event, block } of entries) {
    const session = block.session!;
    const start = Date.parse(session.start_time!);
    if (!Number.isFinite(start)) continue;
    const end = session.end_time ? Date.parse(session.end_time) : start + 2 * 60 * 60 * 1000;
    const entry: TodaySession = {
      key: `${event.id}:${session.id}`,
      eventName: event.name,
      sessionTitle: session.title || session.location,
      location: session.location,
      startTime: session.start_time!,
      endTime: session.end_time,
      openCounts: openCounts(block.tasks)
    };
    if (start <= nowMs && nowMs < end) result.now.push(entry);
    else if (start > nowMs && !result.next) {
      result.next = { ...entry, minutes: Math.ceil((start - nowMs) / 60000) };
    }
  }
  return result;
}
