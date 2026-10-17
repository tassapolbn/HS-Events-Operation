/**
 * The days an event runs.
 *
 * An event has a first day (event_date) and, when it runs over several days, a
 * last day (end_date). Days are yyyy-MM-dd strings counted as whole calendar
 * days, whatever time zone the device is in. No React or Supabase here, so
 * the rules can be tested on their own.
 */

export interface EventSpan {
  event_date: string;
  end_date?: string | null;
}

const DAY_MS = 86_400_000;

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** A yyyy-MM-dd day moved by a number of days */
export function shiftDay(day: string, days: number): string {
  return new Date((dayNumber(day) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from one day to another (negative when `to` comes first) */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The last day of the event: its end date, or its only day */
export function eventEndDate(event: EventSpan): string {
  return event.end_date && event.end_date > event.event_date ? event.end_date : event.event_date;
}

export function isMultiDay(event: EventSpan): boolean {
  return eventEndDate(event) > event.event_date;
}

/** How many days the event runs, at least 1 */
export function eventDayCount(event: EventSpan): number {
  return daysBetween(event.event_date, eventEndDate(event)) + 1;
}

export function eventCoversDay(event: EventSpan, day: string): boolean {
  return day >= event.event_date && day <= eventEndDate(event);
}

/** Which day of the event this is: 1 for the first day */
export function eventDayIndex(event: EventSpan, day: string): number {
  return daysBetween(event.event_date, day) + 1;
}

/** Whether the event runs on any day from `from` to `to`, both included */
export function eventOverlaps(event: EventSpan, from: string, to: string): boolean {
  return event.event_date <= to && eventEndDate(event) >= from;
}

/** The event's days that fall from `from` to `to`, first to last */
export function eventDaysWithin(event: EventSpan, from: string, to: string): string[] {
  const first = event.event_date > from ? event.event_date : from;
  const last = eventEndDate(event) < to ? eventEndDate(event) : to;
  const days: string[] = [];
  for (let day = first; day <= last; day = shiftDay(day, 1)) days.push(day);
  return days;
}

/** A new event gets a ready-to-use session for each of its days, up to this many */
export const MAX_DAY_SESSIONS = 14;

/** The days a new event gets a session for: every day, or only the first when it runs very long */
export function sessionDaysForNewEvent(event: EventSpan): string[] {
  const count = eventDayCount(event);
  if (count > MAX_DAY_SESSIONS) return [event.event_date];
  return eventDaysWithin(event, event.event_date, eventEndDate(event));
}

/** The end date to store: null for a one-day event, so nothing changes for those */
export function storedEndDate(start: string, end: string | null | undefined): string | null {
  return end && start && end > start ? end : null;
}
