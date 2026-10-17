/**
 * What the calendar shows on each day.
 *
 * - An event appears on every day from its first to its last day, with the
 *   sessions it has on that day.
 * - Sessions on other days (a setup day before the event, a pack-up day after
 *   it) appear on their own day as a "prep" entry of the event, so the work
 *   before and after is on the calendar too.
 * - When the event's "Setup begins" time falls on a day before the event and
 *   no session covers that day, that day gets a prep entry as well.
 *
 * Times and days are read in Bangkok time, as the school works. No React or
 * Supabase here, so the layout can be tested on its own.
 */

import { eventDayCount, eventDayIndex, eventDaysWithin, eventEndDate, isMultiDay, shiftDay } from './eventDays.ts';
import type { DisplayEvent } from '../types';

export interface CalendarEvent {
  id: string;
  name: string;
  event_date: string;
  end_date?: string | null;
  status: string;
  campus?: string;
  location?: string;
  header_color?: string;
  event_start?: string | null;
  event_finish?: string | null;
  setup_start?: string | null;
}

export interface CalendarSession {
  id: string;
  event_id: string;
  title: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location?: string;
  sort_order?: number;
}

interface EntryBase {
  key: string;
  day: string;
  event: CalendarEvent;
  /** The sessions of this event on this day, earliest first */
  sessions: CalendarSession[];
  /** HH:mm the entry starts that day, for ordering; null when no time is known */
  time: string | null;
}

export interface EventDayEntry extends EntryBase {
  kind: 'event';
  /** 1 on the first day */
  dayIndex: number;
  dayCount: number;
}

export interface PrepDayEntry extends EntryBase {
  kind: 'prep';
  /** A day before the event's first day (setup), or after its last day (pack-up) */
  when: 'before' | 'after';
  /** The "Setup begins" time, when that is what puts this day on the calendar */
  setupTime: string | null;
}

export type CalendarEntry = EventDayEntry | PrepDayEntry;

const BANGKOK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** The Bangkok day and HH:mm of a timestamp */
export function bangkokDayTime(iso: string | null | undefined): { day: string; time: string } | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const parts = Object.fromEntries(BANGKOK.formatToParts(at).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const sessionTime = (session: CalendarSession) => bangkokDayTime(session.start_time)?.time ?? null;

function bySessionOrder(a: CalendarSession, b: CalendarSession): number {
  const at = sessionTime(a) ?? '99:99';
  const bt = sessionTime(b) ?? '99:99';
  return at.localeCompare(bt) || (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

function earliest(times: Array<string | null | undefined>): string | null {
  const known = times.filter((time): time is string => !!time).sort();
  return known[0] ?? null;
}

/**
 * Calendar entries for each day from `from` to `to` (yyyy-MM-dd, both
 * included), in the order they happen that day. Days without anything are
 * left out of the map.
 */
export function buildCalendarDays(
  events: CalendarEvent[],
  sessions: CalendarSession[],
  from: string,
  to: string
): Map<string, CalendarEntry[]> {
  const days = new Map<string, CalendarEntry[]>();
  const add = (entry: CalendarEntry) => {
    const list = days.get(entry.day) ?? [];
    list.push(entry);
    days.set(entry.day, list);
  };

  // Each event once, whichever query brought it
  const byId = new Map<string, CalendarEvent>();
  for (const event of events) byId.set(event.id, event);

  // The event's sessions by day
  const sessionsByEventDay = new Map<string, CalendarSession[]>();
  for (const session of sessions) {
    if (!byId.has(session.event_id)) continue;
    const key = `${session.event_id}|${session.session_date}`;
    const list = sessionsByEventDay.get(key) ?? [];
    list.push(session);
    sessionsByEventDay.set(key, list);
  }
  for (const list of sessionsByEventDay.values()) list.sort(bySessionOrder);

  for (const event of byId.values()) {
    const start = bangkokDayTime(event.event_start);
    const covered = new Set<string>();

    for (const day of eventDaysWithin(event, from, to)) {
      covered.add(day);
      const daySessions = sessionsByEventDay.get(`${event.id}|${day}`) ?? [];
      add({
        kind: 'event',
        key: `${event.id}|${day}`,
        day,
        event,
        sessions: daySessions,
        dayIndex: eventDayIndex(event, day),
        dayCount: eventDayCount(event),
        time: earliest([...daySessions.map(sessionTime), start?.day === day ? start.time : null])
      });
    }

    // Sessions outside the event's own days: setup before, pack-up after
    const last = eventEndDate(event);
    const prepDays = new Set<string>();
    for (const session of sessions) {
      if (session.event_id !== event.id) continue;
      const day = session.session_date;
      if (day >= event.event_date && day <= last) continue;
      if (day < from || day > to) continue;
      prepDays.add(day);
    }
    // "Setup begins" on an earlier day with no session of its own
    const setup = bangkokDayTime(event.setup_start);
    const setupDay = setup && setup.day < event.event_date && setup.day >= from && setup.day <= to ? setup.day : null;
    if (setupDay) prepDays.add(setupDay);

    for (const day of [...prepDays].sort()) {
      if (covered.has(day)) continue;
      const daySessions = sessionsByEventDay.get(`${event.id}|${day}`) ?? [];
      const setupTime = daySessions.length === 0 && day === setupDay ? setup?.time ?? null : null;
      add({
        kind: 'prep',
        key: `${event.id}|prep|${day}`,
        day,
        event,
        sessions: daySessions,
        when: day < event.event_date ? 'before' : 'after',
        setupTime,
        time: earliest([...daySessions.map(sessionTime), setupTime])
      });
    }
  }

  for (const list of days.values()) {
    list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.event.name.localeCompare(b.event.name));
  }
  return days;
}

/** The words a prep entry falls back on when its session has no name */
export interface PrepWords {
  /** "Setup begins", for a day that is on the calendar because of the event's setup time */
  setupBegins: string;
  /** A day before the event */
  before: string;
  /** A day after the last day of an event that has an end date */
  after: string;
  /** A day after an event without an end date, which may be a later day of the event itself */
  session: string;
}

/** What a setup or pack-up day says it is: its session's name, or what kind of day it is */
export function prepLabel(entry: CalendarEntry, words: PrepWords): string {
  if (entry.kind !== 'prep') return '';
  const fallback = entry.setupTime
    ? words.setupBegins
    : entry.when === 'before'
      ? words.before
      : isMultiDay(entry.event)
        ? words.after
        : words.session;
  // The first session that has a name speaks for the day; the others are counted
  const name = entry.sessions.map((session) => session.title?.trim()).find(Boolean) || fallback;
  return entry.sessions.length > 1 ? `${name} +${entry.sessions.length - 1}` : name;
}

/** Events that stay off the alert bar: not confirmed yet, or filed away */
const QUIET_STATUSES = new Set(['draft', 'archived']);

export interface DayAlert {
  day: string;
  /** 0 for today, 1 for tomorrow */
  offset: 0 | 1;
  entries: CalendarEntry[];
}

/**
 * What is on today and tomorrow, for the alert bar: events running on those
 * days and their sessions, and setup or pack-up sessions of other events.
 * A day with nothing on it is left out.
 */
export function todayTomorrowAlerts(
  events: CalendarEvent[],
  sessions: CalendarSession[],
  today: string
): DayAlert[] {
  const tomorrow = shiftDay(today, 1);
  const live = events.filter((event) => !QUIET_STATUSES.has(event.status));
  const days = buildCalendarDays(live, sessions, today, tomorrow);
  const alerts: DayAlert[] = [];
  for (const [offset, day] of [[0, today], [1, tomorrow]] as const) {
    const entries = days.get(day) ?? [];
    if (entries.length > 0) alerts.push({ day, offset, entries });
  }
  return alerts;
}

/** A fingerprint of what the bar shows today, so hiding it lasts until something changes */
export function alertsSignature(today: string, alerts: DayAlert[]): string {
  return [today, ...alerts.map((alert) => `${alert.day}:${alert.entries.map((entry) => entry.key).join(',')}`)].join('|');
}

/** The display board's events in the calendar's shape */
export function calendarFromBoard(events: DisplayEvent[]): { events: CalendarEvent[]; sessions: CalendarSession[] } {
  return {
    events: events.map((event) => ({
      id: event.id,
      name: event.name,
      event_date: event.event_date,
      end_date: event.end_date ?? null,
      status: event.status,
      campus: event.campus,
      location: event.location,
      header_color: event.header_color,
      event_start: event.event_start,
      event_finish: event.event_finish,
      setup_start: event.setup_start
    })),
    sessions: events.flatMap((event) =>
      (event.sessions ?? []).map((session) => ({
        id: session.id,
        event_id: event.id,
        title: session.title,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        location: session.location,
        sort_order: session.sort_order
      }))
    )
  };
}
