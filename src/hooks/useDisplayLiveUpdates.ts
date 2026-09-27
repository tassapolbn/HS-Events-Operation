import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { createDisplayLive, type LiveStatus, type SignalRow } from '../lib/displayLive';
import type { Campus } from '../types';

/**
 * Reloads the display board when the Events team changes something, instead of
 * asking for everything every 30 seconds.
 *
 * The board listens to its campus's rows in display_signals over Realtime. Only
 * version numbers travel that way; the work itself is still read through the
 * public display functions, and only when a number moves.
 *
 * Returns the connection state so the board can show that it is live.
 */
export function useDisplayLiveUpdates(campus?: Campus): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    setStatus('connecting');
    const live = createDisplayLive({
      campus,
      reload: (board) => void queryClient.invalidateQueries({ queryKey: ['display', board] }),
      reloadAll: () => void queryClient.invalidateQueries({ queryKey: ['display'] }),
      fetchSignals: async () => {
        let query = supabase.from('display_signals').select('campus, board, version');
        if (campus) query = query.eq('campus', campus);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as SignalRow[];
      },
      isHidden: () => document.visibilityState === 'hidden',
      onStatus: setStatus
    });

    // A fresh name for every mount: React mounts twice in development, and a
    // channel that is still closing cannot be subscribed to again.
    const topic = `display-signals:${campus ?? 'all'}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(topic)
      .on<SignalRow>(
        'postgres_changes',
        campus
          ? { event: '*', schema: 'public', table: 'display_signals', filter: `campus=eq.${campus}` }
          : { event: '*', schema: 'public', table: 'display_signals' },
        (payload) => live.signal(payload.new as Partial<SignalRow>)
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') live.connection('live');
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') live.connection('offline');
      });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') live.visible();
    };
    const onOnline = () => live.online();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    live.start();

    return () => {
      live.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      void supabase.removeChannel(channel);
    };
  }, [campus, queryClient]);

  return status;
}
