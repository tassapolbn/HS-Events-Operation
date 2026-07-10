import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { AppNotification } from '../types';

export function useNotificationsFeed(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const [{ data: rows, error }, { data: reads, error: readsError }] = await Promise.all([
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('notification_reads').select('notification_id').eq('user_id', userId!)
      ]);
      if (error) throw error;
      if (readsError) throw readsError;
      const readSet = new Set((reads ?? []).map((r) => r.notification_id as string));
      return ((rows ?? []) as AppNotification[]).map((n) => ({ ...n, read: readSet.has(n.id) }));
    }
  });
}

export function useMarkNotificationsRead(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      if (!userId || notificationIds.length === 0) return;
      const rows = notificationIds.map((id) => ({ notification_id: id, user_id: userId }));
      const { error } = await supabase
        .from('notification_reads')
        .upsert(rows, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  });
}

export interface SendNotificationPayload {
  type: 'event' | 'request';
  id: string;
  departmentIds: string[];
}

export interface SendNotificationResult {
  ok: boolean;
  results: { department: string; emailed: string[]; error?: string }[];
}

export function useSendNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendNotificationPayload): Promise<SendNotificationResult> => {
      const { data, error } = await supabase.functions.invoke('send-notification', { body: payload });
      if (error) throw error;
      return data as SendNotificationResult;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  });
}
