import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ProblemKind } from '../lib/problemLog';

export interface ClientProblem {
  id: string;
  first_seen: string;
  last_seen: string;
  times: number;
  user_id: string | null;
  kind: ProblemKind | string;
  message: string;
  detail: string;
  page: string;
  build: string;
  browser: string;
  profile?: { full_name: string } | null;
}

/** How far back the Dashboard looks */
export const PROBLEM_DAYS = 7;

/**
 * Problems people met in the last week, newest first. Admins only: the
 * database returns nothing to anyone else.
 */
export function useProblemLog(enabled: boolean) {
  return useQuery({
    queryKey: ['problem-log'],
    enabled,
    staleTime: 5 * 60_000,
    // A missing table (database not updated yet) simply hides the card
    retry: false,
    queryFn: async (): Promise<ClientProblem[]> => {
      const since = new Date(Date.now() - PROBLEM_DAYS * 24 * 60 * 60_000).toISOString();
      const { data, error } = await supabase
        .from('client_errors')
        .select('*, profile:profiles(full_name)')
        .gte('last_seen', since)
        .order('last_seen', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as ClientProblem[];
    }
  });
}

/** Clear one entry, or every entry when no id is given */
export function useClearProblems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id?: string) => {
      const query = supabase.from('client_errors').delete();
      const { error } = id ? await query.eq('id', id) : await query.not('id', 'is', null);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['problem-log'] })
  });
}
