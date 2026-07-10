import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EventRow, EventWithTasks } from '../types';

export interface EventFilters {
  search?: string;
  status?: string;
  priority?: string;
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
  staff?: string;
}

export function useEvents(filters: EventFilters = {}) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: async (): Promise<EventWithTasks[]> => {
      let query = supabase
        .from('events')
        .select('*, event_tasks(id, department_id, status, assigned_staff, title, deleted_at)')
        .is('deleted_at', null)
        .order('event_date', { ascending: false });

      if (filters.search) {
        const s = filters.search.replace(/[%,()]/g, ' ').trim();
        if (s) query = query.or(`name.ilike.%${s}%,location.ilike.%${s}%`);
      }
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.priority) query = query.eq('priority', filters.priority);
      if (filters.dateFrom) query = query.gte('event_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('event_date', filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as EventWithTasks[];
      rows = rows.map((row) => ({
        ...row,
        event_tasks: (row.event_tasks ?? []).filter((task) => !task.deleted_at)
      }));
      if (filters.departmentId) {
        rows = rows.filter((row) => row.event_tasks.some((task) => task.department_id === filters.departmentId));
      }
      if (filters.staff) {
        const s = filters.staff.toLowerCase();
        rows = rows.filter((row) => row.event_tasks.some((task) => task.assigned_staff.toLowerCase().includes(s)));
      }
      return rows;
    }
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['events', 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<EventWithTasks | null> => {
      const { data, error } = await supabase
        .from('events')
        .select('*, event_tasks(*)')
        .eq('id', id!)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      const event = data as EventWithTasks;
      event.event_tasks = (event.event_tasks ?? [])
        .filter((task) => !task.deleted_at)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
      return event;
    }
  });
}

export type EventInput = Partial<Omit<EventRow, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

export function useEventMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createEvent = useMutation({
    mutationFn: async (input: EventInput): Promise<EventRow> => {
      const { data, error } = await supabase.from('events').insert(input).select().single();
      if (error) throw error;
      return data as EventRow;
    },
    onSuccess: invalidate
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, ...input }: EventInput & { id: string }): Promise<EventRow> => {
      const { data, error } = await supabase.from('events').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data as EventRow;
    },
    onSuccess: invalidate
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { createEvent, updateEvent, deleteEvent };
}
