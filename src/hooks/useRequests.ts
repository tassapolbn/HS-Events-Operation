import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { DepartmentRequest } from '../types';

export interface RequestFilters {
  search?: string;
  departmentId?: string;
  status?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useRequests(filters: RequestFilters = {}) {
  return useQuery({
    queryKey: ['requests', filters],
    queryFn: async (): Promise<DepartmentRequest[]> => {
      let query = supabase
        .from('department_requests')
        .select('*')
        .is('deleted_at', null)
        .order('request_date', { ascending: false });

      if (filters.search) {
        const s = filters.search.replace(/[%,()]/g, ' ').trim();
        if (s) query = query.or(`title.ilike.%${s}%,reference.ilike.%${s}%,location.ilike.%${s}%`);
      }
      if (filters.departmentId) query = query.eq('department_id', filters.departmentId);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.priority) query = query.eq('priority', filters.priority);
      if (filters.dateFrom) query = query.gte('request_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('request_date', filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DepartmentRequest[];
    }
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['requests', 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<DepartmentRequest | null> => {
      const { data, error } = await supabase
        .from('department_requests')
        .select('*')
        .eq('id', id!)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return data as DepartmentRequest;
    }
  });
}

export type RequestInput = Partial<Omit<DepartmentRequest, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

export function useRequestMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['requests'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createRequest = useMutation({
    mutationFn: async (input: RequestInput): Promise<DepartmentRequest> => {
      const { data, error } = await supabase.from('department_requests').insert(input).select().single();
      if (error) throw error;
      return data as DepartmentRequest;
    },
    onSuccess: invalidate
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, ...input }: RequestInput & { id: string }): Promise<DepartmentRequest> => {
      const { data, error } = await supabase
        .from('department_requests')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as DepartmentRequest;
    },
    onSuccess: invalidate
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('department_requests')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { createRequest, updateRequest, deleteRequest };
}
