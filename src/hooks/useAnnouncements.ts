import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { bangkokToday, type Announcement, type AnnouncementTone } from '../lib/announcements';
import type { Campus } from '../types';

export type AnnouncementInput = Pick<Announcement, 'message' | 'tone' | 'starts_on' | 'ends_on' | 'show_on_board' | 'campus'>;

/** Announcements that are showing now or will show later; finished ones are left out */
export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    staleTime: 5 * 60_000,
    // Before the database has announcements this quietly shows none
    retry: false,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .or(`ends_on.is.null,ends_on.gte.${bangkokToday()}`)
        .order('starts_on', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    }
  });
}

export function useAnnouncementMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['display', 'announcements'] });
  };

  const create = useMutation({
    mutationFn: async ({ input, userId }: { input: AnnouncementInput; userId: string }) => {
      const { error } = await supabase.from('announcements').insert({ ...input, created_by: userId });
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AnnouncementInput }) => {
      const { error } = await supabase.from('announcements').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { create, update, remove };
}

export interface BoardAnnouncement {
  id: string;
  message: string;
  tone: AnnouncementTone;
}

/**
 * Today's notices for a display board. Reloaded with the events board when
 * the database raises its signal (see useDisplayLiveUpdates), at midnight and
 * once an hour, never on a timer of its own.
 */
export function useBoardAnnouncements(campus?: Campus) {
  return useQuery({
    queryKey: ['display', 'announcements', campus ?? 'all'],
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<BoardAnnouncement[]> => {
      const { data, error } = await supabase.rpc('public_board_announcements', campus ? { p_campus: campus } : {});
      // A board opened before the database update shows no notices rather than an error
      if (error?.code === 'PGRST202') return [];
      if (error) throw error;
      return (data ?? []) as BoardAnnouncement[];
    }
  });
}
