import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface CalendarFeedKey {
  key: string;
  created_at: string;
}

/** The secret key in every calendar link. Read only while the panel is open. */
export function useCalendarFeedKey(enabled: boolean) {
  return useQuery({
    queryKey: ['calendar-feed-key'],
    enabled,
    retry: false,
    queryFn: async (): Promise<CalendarFeedKey | null> => {
      const { data, error } = await supabase.from('calendar_feed_keys').select('key, created_at').eq('id', 1).maybeSingle();
      if (error) throw error;
      return (data as CalendarFeedKey | null) ?? null;
    }
  });
}

/** A new key for every link (Events team only). The old links stop working. */
export function useRotateCalendarFeedKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('rotate_calendar_feed_key');
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-feed-key'] })
  });
}
