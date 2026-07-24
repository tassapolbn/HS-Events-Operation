import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EventSession } from '../types';

export type SessionInput = Partial<Omit<EventSession, 'id'>>;

export function useSessionMutations(eventId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['display'] });
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

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      // Tasks in this session are kept and moved to the whole-event group
      const { error } = await supabase.from('event_sessions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { createSession, updateSession, deleteSession };
}
