import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { DisplayDepartment, DisplayEvent, DisplayRequest, TaskStatus } from '../types';

const REFRESH_MS = 30_000;

export function useDisplayDepartments() {
  return useQuery({
    queryKey: ['display', 'departments'],
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<DisplayDepartment[]> => {
      const { data, error } = await supabase.rpc('public_display_departments');
      if (error) throw error;
      return (data ?? []) as DisplayDepartment[];
    }
  });
}

export function useDisplayEvents() {
  return useQuery({
    queryKey: ['display', 'events'],
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<DisplayEvent[]> => {
      const { data, error } = await supabase.rpc('public_display_events');
      if (error) throw error;
      return (data ?? []) as DisplayEvent[];
    }
  });
}

export function useDisplayRequests() {
  return useQuery({
    queryKey: ['display', 'requests'],
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<DisplayRequest[]> => {
      const { data, error } = await supabase.rpc('public_display_requests');
      if (error) throw error;
      return (data ?? []) as DisplayRequest[];
    }
  });
}

/** Tick or untick a task from the board (optimistic) */
export function useToggleDisplayTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, done }: { taskId: string; done: boolean }) => {
      const { error } = await supabase.rpc('public_toggle_task', { p_task_id: taskId, p_done: done });
      if (error) throw error;
    },
    onMutate: async ({ taskId, done }) => {
      await queryClient.cancelQueries({ queryKey: ['display', 'events'] });
      const previous = queryClient.getQueryData<DisplayEvent[]>(['display', 'events']);
      queryClient.setQueryData<DisplayEvent[]>(['display', 'events'], (old) =>
        (old ?? []).map((event) => ({
          ...event,
          tasks: event.tasks.map((task) =>
            task.id === taskId ? { ...task, status: done ? 'completed' : 'not_started' } : task
          )
        }))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['display', 'events'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['display', 'events'] })
  });
}

/** Set a request status from the board (optimistic) */
export function useSetDisplayRequestStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: TaskStatus }) => {
      const { error } = await supabase.rpc('public_set_request_status', {
        p_request_id: requestId,
        p_status: status
      });
      if (error) throw error;
    },
    onMutate: async ({ requestId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['display', 'requests'] });
      const previous = queryClient.getQueryData<DisplayRequest[]>(['display', 'requests']);
      queryClient.setQueryData<DisplayRequest[]>(['display', 'requests'], (old) =>
        (old ?? []).map((request) => (request.id === requestId ? { ...request, status } : request))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['display', 'requests'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['display', 'requests'] })
  });
}
