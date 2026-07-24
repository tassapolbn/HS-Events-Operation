import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ChecklistItem, EventTask } from '../types';

export type TaskInput = Partial<Omit<EventTask, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

export function useTaskMutations(eventId?: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['display'] });
    if (eventId) queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
  };

  const createTask = useMutation({
    mutationFn: async (input: TaskInput): Promise<EventTask> => {
      const { data, error } = await supabase.from('event_tasks').insert(input).select().single();
      if (error) throw error;
      return data as EventTask;
    },
    onSuccess: invalidate
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...input }: TaskInput & { id: string }): Promise<EventTask> => {
      const { data, error } = await supabase.from('event_tasks').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data as EventTask;
    },
    onSuccess: invalidate
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { createTask, updateTask, deleteTask };
}

export function useChecklist(taskId: string | undefined) {
  return useQuery({
    queryKey: ['checklist', taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<ChecklistItem[]> => {
      const { data, error } = await supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId!)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as ChecklistItem[];
    }
  });
}

export function useChecklistMutations(taskId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['checklist', taskId] });

  const addItem = useMutation({
    mutationFn: async ({ label, sortOrder }: { label: string; sortOrder: number }) => {
      const { error } = await supabase
        .from('task_checklist_items')
        .insert({ task_id: taskId, label, sort_order: sortOrder });
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const toggleItem = useMutation({
    mutationFn: async ({ id, isDone, userId }: { id: string; isDone: boolean; userId: string }) => {
      const { error } = await supabase
        .from('task_checklist_items')
        .update({
          is_done: isDone,
          done_by: isDone ? userId : null,
          done_at: isDone ? new Date().toISOString() : null
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_checklist_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { addItem, toggleItem, removeItem };
}

/** Tasks for the signed-in user's department across all events */
export function useMyDepartmentTasks(departmentId: string | null | undefined) {
  return useQuery({
    queryKey: ['my-tasks', departmentId],
    enabled: !!departmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks')
        .select('*, events!inner(id, name, event_date, location, status, deleted_at)')
        .eq('department_id', departmentId!)
        .is('deleted_at', null)
        .is('events.deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      type Row = EventTask & {
        events: { id: string; name: string; event_date: string; location: string; status: string };
      };
      return (data ?? []) as Row[];
    }
  });
}
