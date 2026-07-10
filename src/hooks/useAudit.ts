import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { AuditEntry } from '../types';

const SELECT = '*, changed_by_profile:profiles(full_name)';

export function useAuditForRecord(recordId: string | undefined) {
  return useQuery({
    queryKey: ['audit', recordId],
    enabled: !!recordId,
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select(SELECT)
        .eq('record_id', recordId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    }
  });
}

export function useRecentActivity(limit = 12) {
  return useQuery({
    queryKey: ['audit', 'recent', limit],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    }
  });
}

/** Human-readable field-level changes between old and new data */
export function diffAuditEntry(entry: AuditEntry): { field: string; oldValue: string; newValue: string }[] {
  if (entry.action !== 'UPDATE' || !entry.old_data || !entry.new_data) return [];
  const ignored = new Set(['updated_at', 'created_at', 'id']);
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  for (const key of Object.keys(entry.new_data)) {
    if (ignored.has(key)) continue;
    const before = JSON.stringify(entry.old_data[key] ?? null);
    const after = JSON.stringify(entry.new_data[key] ?? null);
    if (before !== after) {
      const clean = (v: string) => {
        let s = v.replace(/^"|"$/g, '');
        s = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return s.length > 80 ? `${s.slice(0, 77)}...` : s || 'null';
      };
      changes.push({ field: key, oldValue: clean(before), newValue: clean(after) });
    }
  }
  return changes;
}
