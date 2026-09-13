import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ChecklistItem, EventTask } from '../types';

export type TaskInput = Partial<Omit<EventTask, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;
export type TaskPatch = TaskInput & { id: string };

/** Run promises a few at a time so a large paste does not open 40 sockets at once. */
async function inChunks<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run));
  }
}

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

  /** Insert several tasks in one round trip (paste, duplicate, import). */
  const createTasks = useMutation({
    mutationFn: async (inputs: TaskInput[]): Promise<EventTask[]> => {
      if (inputs.length === 0) return [];
      const { data, error } = await supabase.from('event_tasks').insert(inputs).select();
      if (error) throw error;
      return (data ?? []) as EventTask[];
    },
    onSuccess: invalidate
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...input }: TaskPatch): Promise<EventTask> => {
      const { data, error } = await supabase.from('event_tasks').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data as EventTask;
    },
    onSuccess: invalidate
  });

  /** Apply a different patch to each task (one grid edit, paste or fill). */
  const updateTasks = useMutation({
    mutationFn: async (patches: TaskPatch[]) => {
      await inChunks(patches, 6, async ({ id, ...input }) => {
        const { error } = await supabase.from('event_tasks').update(input).eq('id', id);
        if (error) throw error;
      });
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

  const deleteTasks = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('event_tasks')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  /** Bring soft deleted tasks back, so a grid delete can be undone. */
  const restoreTasks = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from('event_tasks').update({ deleted_at: null }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { createTask, createTasks, updateTask, updateTasks, deleteTask, deleteTasks, restoreTasks };
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
