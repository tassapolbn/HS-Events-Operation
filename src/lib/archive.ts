import type { EventStatus, TaskStatus } from '../types';

/**
 * What may go into the Archive folder, and where it comes back to.
 *
 * Something can be archived once it is finished (completed, or cancelled for a
 * request) or once its last scheduled day has passed. Days are school days in
 * Bangkok, whatever timezone the device is set to, so "past" flips at midnight
 * in Phuket for everyone.
 */

const SCHOOL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
});

/** The school day (yyyy-MM-dd) of a timestamp, or a date-only value unchanged. */
export function schoolDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = Date.parse(value);
  return Number.isFinite(time) ? SCHOOL_DAY.format(time) : '';
}

/** Today's school day in Bangkok as yyyy-MM-dd. */
export function schoolToday(now: number = Date.now()): string {
  return SCHOOL_DAY.format(now);
}

/** Why an item may be archived, or null while it is still live work. */
export type ArchiveReason = 'completed' | 'cancelled' | 'past';

export interface ArchivableEvent {
  status: EventStatus;
  event_date: string;
  /** Every session counts, hidden ones too: a later session means the event is not over. */
  event_sessions?: Array<{ session_date: string }> | null;
}

/** The last day an event runs: its own date or its latest session. */
export function eventLastDay(event: ArchivableEvent): string {
  let last = event.event_date;
  for (const session of event.event_sessions ?? []) {
    if (session.session_date > last) last = session.session_date;
  }
  return last;
}

export function eventArchiveReason(event: ArchivableEvent, today = schoolToday()): ArchiveReason | null {
  if (event.status === 'archived') return null;
  if (event.status === 'completed') return 'completed';
  return eventLastDay(event) < today ? 'past' : null;
}

export interface ArchivableRequest {
  status: TaskStatus;
  request_date: string;
  due_date: string | null;
  due_at?: string | null;
  setup_datetime: string | null;
  teardown_datetime: string | null;
  archived_at?: string | null;
}

/**
 * The last day a request is scheduled for: the latest of its deadline, setup
 * and teardown. A request with none of those falls back to the day it was made.
 */
export function requestLastDay(request: ArchivableRequest): string {
  const days = [request.due_at, request.due_date, request.teardown_datetime, request.setup_datetime]
    .filter((value): value is string => !!value)
    .map(schoolDay)
    .filter(Boolean);
  return days.length ? days.reduce((a, b) => (b > a ? b : a)) : request.request_date;
}

export function requestArchiveReason(request: ArchivableRequest, today = schoolToday()): ArchiveReason | null {
  if (request.archived_at) return null;
  if (request.status === 'completed') return 'completed';
  if (request.status === 'cancelled') return 'cancelled';
  return requestLastDay(request) < today ? 'past' : null;
}

/** The status a restored event returns to. Events archived without one go back to completed. */
export function restoreStatus(event: { status_before_archive?: EventStatus | null }): EventStatus {
  const before = event.status_before_archive;
  return before && before !== 'archived' ? before : 'completed';
}

/** Archived event ids grouped by the status each one returns to, for one update per status. */
export function groupByRestoreStatus<T extends { id: string; status_before_archive?: EventStatus | null }>(
  events: T[]
): Map<EventStatus, string[]> {
  const groups = new Map<EventStatus, string[]>();
  for (const event of events) {
    const target = restoreStatus(event);
    groups.set(target, [...(groups.get(target) ?? []), event.id]);
  }
  return groups;
}
