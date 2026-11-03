import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { buildJobIndex, type JobHistoryRow, type JobIndex } from '../lib/jobSuggestions';

const EMPTY: JobIndex = new Map();

/**
 * Each department's past jobs, for suggestions while typing in the worksheet.
 * Read once and kept for ten minutes: the titles are small, and a suggestion
 * from a job typed a minute ago adds little.
 */
export function useJobHistory(enabled: boolean): JobIndex {
  const { data } = useQuery({
    queryKey: ['job-history'],
    enabled,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<JobHistoryRow[]> => {
      const { data: rows, error } = await supabase
        .from('event_tasks')
        .select('title, department_id, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (rows ?? []) as JobHistoryRow[];
    }
  });
  return useMemo(() => (data ? buildJobIndex(data) : EMPTY), [data]);
}
