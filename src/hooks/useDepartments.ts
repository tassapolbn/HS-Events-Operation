import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Department } from '../types';

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase.from('departments').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as Department[];
    },
    staleTime: 1000 * 60 * 30
  });
}
