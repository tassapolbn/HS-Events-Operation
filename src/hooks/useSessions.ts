import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Campus, EventSession } from '../types';

export type SessionInput = Partial<Omit<EventSession, 'id'>>;

export function useSessionMutations(eventId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['display'] });
    queryClient.invalidateQueries({ queryKey: ['session-sources'] });
  };

  const createSession = useMutation({
    mutationFn: async (input: SessionInput): Promise<EventSession> => {
      const { data, error } = await supabase
        .from('event_sessions')
        .insert({ ...input, event_id: eventId })
        .select()
        .single();
      if (error) throw error;
      return data as EventSession;
    },
    onSuccess: invalidate
  });

  const updateSession = useMutation({
    mutationFn: async ({ id, ...input }: SessionInput & { id: string }): Promise<EventSession> => {
      const { data, error } = await supabase.from('event_sessions').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data as EventSession;
    },
    onSuccess: invalidate
  });

  /**
   * Write a new order for the sessions of one day. The rows come from
   * reorderWithinDay, which only ever reshuffles sessions that share a date,
   * so an earlier date can never be pushed below a later one.
   */
  const reorderSessions = useMutation({
    mutationFn: async (rows: Array<{ id: string; sort_order: number }>) => {
      for (const row of rows) {
        const { error } = await supabase
          .from('event_sessions')
          .update({ sort_order: row.sort_order })
          .eq('id', row.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidate
  });

  /** Take a session off the public display board, or put it back on it. */
  const setSessionHidden = useMutation({
    mutationFn: async ({ id, hidden }: { id: string; hidden: boolean }) => {
      const { error } = await supabase.from('event_sessions').update({ is_hidden: hidden }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      // Tasks in this session are kept and moved to the whole-event group
      const { error } = await supabase.from('event_sessions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { createSession, updateSession, reorderSessions, setSessionHidden, deleteSession };
}

/** One event that already has sessions, used as a source to copy sessions from. */
export interface SessionSourceEvent {
  id: string;
  name: string;
  event_date: string;
  campus: Campus;
  event_sessions: EventSession[];
  event_tasks: Array<{ id: string; session_id: string | null; deleted_at: string | null }>;
}

/**
 * Recent events that have at least one session, so a session and its tasks can be
 * copied into the event being planned. Task rows are ids only: the full task bodies
 * are loaded with useEvent once a source event is picked.
 */
export function useSessionSourceEvents(excludeEventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['session-sources', excludeEventId ?? 'all'],
    enabled,
    queryFn: async (): Promise<SessionSourceEvent[]> => {
      let query = supabase
        .from('events')
        .select('id, name, event_date, campus, event_sessions(*), event_tasks(id, session_id, deleted_at)')
        .is('deleted_at', null)
        .order('event_date', { ascending: false })
        .limit(80);
      if (excludeEventId) query = query.neq('id', excludeEventId);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as SessionSourceEvent[])
        .map((row) => ({
          ...row,
          event_sessions: [...(row.event_sessions ?? [])].sort(
            (a, b) => a.session_date.localeCompare(b.session_date) || a.sort_order - b.sort_order
          ),
          event_tasks: (row.event_tasks ?? []).filter((task) => !task.deleted_at)
        }))
        .filter((row) => row.event_sessions.length > 0);
    }
  });
}
