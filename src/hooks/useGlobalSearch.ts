import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { EMPTY_SEARCH, searchable, type SearchResponse } from '../lib/searchResults';
import { useDebounce } from './useDebounce';

/**
 * Searches events, jobs, requests, saved contacts and people in one request,
 * a moment after typing stops. The database only returns what the person may
 * already see.
 */
export function useGlobalSearch(query: string) {
  const settled = useDebounce(query.trim(), 250);
  const result = useQuery({
    queryKey: ['search', settled],
    enabled: searchable(settled),
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SearchResponse> => {
      const { data, error } = await supabase.rpc('search_everything', { p_query: settled, p_limit: 6 });
      if (error) throw error;
      return { ...EMPTY_SEARCH, ...((data ?? {}) as Partial<SearchResponse>) };
    }
  });
  return { ...result, settled, waiting: query.trim() !== settled };
}
