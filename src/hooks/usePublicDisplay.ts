import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Campus, DisplayDepartment, DisplayEvent, DisplayRequest, TaskStatus } from '../types';

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

/** Today's date as yyyy-MM-dd in the viewer's local timezone. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The last day an event is active: its own date or the latest session date. */
function eventLastDate(event: DisplayEvent): string {
  let last = event.event_date;
  for (const session of event.sessions ?? []) {
    if (session.session_date && session.session_date > last) last = session.session_date;
  }
  return last;
}

export function useDisplayEvents(campus?: Campus) {
  return useQuery({
    queryKey: ['display', 'events', campus ?? 'all'],
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<DisplayEvent[]> => {
      const { data, error } = await supabase.rpc('public_display_events', campus ? { p_campus: campus } : {});
      if (error) throw error;
      const events = (data ?? []) as DisplayEvent[];
      // Drop events once their last scheduled day has passed, so the board
      // only shows today's and upcoming events.
      const today = localToday();
      return events.filter((event) => eventLastDate(event) >= today);
    }
  });
}

export function useDisplayRequests(campus?: Campus) {
  return useQuery({
    queryKey: ['display', 'requests', campus ?? 'all'],
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<DisplayRequest[]> => {
      const { data, error } = await supabase.rpc('public_display_requests', campus ? { p_campus: campus } : {});
      if (error) throw error;
      return (data ?? []) as DisplayRequest[];
    }
  });
}

/**
 * Ask the events team a question from the board. No sign in required: the
 * question is stored and the events team is notified in the app.
 */
export function useAskDisplayQuestion() {
  return useMutation({
    mutationFn: async ({
      eventId,
      departmentId,
      question
    }: {
      eventId: string;
      departmentId: string;
      question: string;
    }) => {
      const { error } = await supabase.rpc('public_ask_question', {
        p_event_id: eventId,
        p_department_id: departmentId || null,
        p_question: question
      });
      if (error) throw error;
    }
  });
}

/** Tick or untick a task from the board (optimistic) */
export function useToggleDisplayTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, done, name }: { taskId: string; done: boolean; name?: string }) => {
      const { error } = await supabase.rpc('public_toggle_task', {
        p_task_id: taskId,
        p_done: done,
        p_name: name ?? ''
      });
      if (error) throw error;
    },
    onMutate: async ({ taskId, done, name }) => {
      await queryClient.cancelQueries({ queryKey: ['display', 'events'] });
      const previous = queryClient.getQueriesData<DisplayEvent[]>({ queryKey: ['display', 'events'] });
      queryClient.setQueriesData<DisplayEvent[]>({ queryKey: ['display', 'events'] }, (old) =>
        (old ?? []).map((event) => ({
          ...event,
          tasks: event.tasks.map((task) =>
            task.id === taskId
              ? { ...task, status: done ? 'completed' : 'not_started', completed_by: done ? name ?? '' : '' }
              : task
          )
        }))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['display', 'events'] })
  });
}

/** Acknowledge a task from the board with the reader's name (no login). */
export function useAcknowledgeDisplayTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      const { error } = await supabase.rpc('public_acknowledge_task', { p_task_id: taskId, p_name: name });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['display', 'events'] })
  });
}

/** Set a request status from the board (optimistic) */
export function useSetDisplayRequestStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, status, name }: { requestId: string; status: TaskStatus; name?: string }) => {
      const { error } = await supabase.rpc('public_set_request_status', {
        p_request_id: requestId,
        p_status: status,
        p_name: name ?? ''
      });
      if (error) throw error;
    },
    onMutate: async ({ requestId, status, name }) => {
      await queryClient.cancelQueries({ queryKey: ['display', 'requests'] });
      const previous = queryClient.getQueriesData<DisplayRequest[]>({ queryKey: ['display', 'requests'] });
      queryClient.setQueriesData<DisplayRequest[]>({ queryKey: ['display', 'requests'] }, (old) =>
        (old ?? []).map((request) =>
          request.id === requestId
            ? {
                ...request,
                status,
                completed_by: status === 'completed' ? name ?? '' : request.completed_by,
                acknowledged_by: status === 'acknowledged' ? name ?? '' : request.acknowledged_by
              }
            : request
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['display', 'requests'] })
  });
}
