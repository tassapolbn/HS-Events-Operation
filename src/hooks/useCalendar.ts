import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { shiftDay } from '../lib/eventDays';
import type { CalendarEvent, CalendarSession } from '../lib/calendarDays';

const EVENT_FIELDS = 'id, name, event_date, end_date, status, campus, location, header_color, event_start, event_finish, setup_start';

/**
 * What the calendar needs for the days from `from` to `to`: every event that
 * runs on any of them, and every session on them, including sessions of
 * events whose own days are outside the view (a setup day before the event).
 *
 * Events a week either side are read too, so an event whose "Setup begins"
 * falls inside the view is found. The calendar is a record of what happened,
 * so archived events stay on it.
 */
export function useCalendarData(from: string, to: string, campus?: string) {
  return useQuery({
    queryKey: ['calendar', from, to, campus ?? 'ALL'],
    queryFn: async (): Promise<{ events: CalendarEvent[]; sessions: CalendarSession[] }> => {
      const wideFrom = shiftDay(from, -7);
      const wideTo = shiftDay(to, 7);
      let eventsQuery = supabase
        .from('events')
        .select(EVENT_FIELDS)
        .is('deleted_at', null)
        .lte('event_date', wideTo)
        // Still running on the first day: ends then or later, or starts then or later
        .or(`end_date.gte.${wideFrom},event_date.gte.${wideFrom}`);
      let sessionsQuery = supabase
        .from('event_sessions')
        .select(`id, event_id, title, session_date, start_time, end_time, location, sort_order, events!inner(${EVENT_FIELDS}, deleted_at)`)
        .gte('session_date', from)
        .lte('session_date', to)
        .is('events.deleted_at', null);
      if (campus) {
        eventsQuery = eventsQuery.eq('campus', campus);
        sessionsQuery = sessionsQuery.eq('events.campus', campus);
      }

      const [eventsResult, sessionsResult] = await Promise.all([eventsQuery, sessionsQuery]);
      if (eventsResult.error) throw eventsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      const events = new Map<string, CalendarEvent>();
      for (const event of (eventsResult.data ?? []) as CalendarEvent[]) events.set(event.id, event);

      type SessionRow = CalendarSession & { events: CalendarEvent | null };
      const sessions: CalendarSession[] = [];
      for (const { events: owner, ...session } of (sessionsResult.data ?? []) as unknown as SessionRow[]) {
        // An event further away, seen only through its session on a day in view
        if (owner && !events.has(owner.id)) events.set(owner.id, owner);
        sessions.push(session);
      }
      return { events: [...events.values()], sessions };
    }
  });
}
