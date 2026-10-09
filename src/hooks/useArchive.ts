import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { groupByRestoreStatus } from '../lib/archive';
import type { Campus, DepartmentRequest, EventRow, EventStatus } from '../types';

/** An archived event as the Archive folder lists it. */
export interface ArchivedEvent
  extends Pick<EventRow, 'id' | 'name' | 'category' | 'campus' | 'event_date' | 'location' | 'status' | 'header_color'> {
  archived_at: string | null;
  status_before_archive: EventStatus | null;
  archived_by_profile: { full_name: string } | null;
  event_sessions: Array<{ session_date: string }>;
  /** Tasks filed away with the event (deleted ones not counted) */
  task_count: number;
}

export interface ArchivedRequest extends DepartmentRequest {
  archived_by_profile: { full_name: string } | null;
}

/**
 * Ids go into the request URL, so large selections are sent in batches small
 * enough for any proxy on the way.
 */
const BATCH = 100;
function batches(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH) out.push(ids.slice(i, i + BATCH));
  return out;
}

export function useArchivedEvents(campus?: Campus) {
  return useQuery({
    queryKey: ['archive', 'events', campus ?? 'ALL'],
    queryFn: async (): Promise<ArchivedEvent[]> => {
      let query = supabase
        .from('events')
        .select(
          'id, name, category, campus, event_date, location, status, header_color, archived_at, status_before_archive, ' +
            'archived_by_profile:profiles!events_archived_by_fkey(full_name), event_sessions(session_date), event_tasks(id, deleted_at)'
        )
        .eq('status', 'archived')
        .is('deleted_at', null)
        .order('archived_at', { ascending: false, nullsFirst: false })
        .order('event_date', { ascending: false });
      if (campus) query = query.eq('campus', campus);
      const { data, error } = await query;
      if (error) throw error;
      type Row = Omit<ArchivedEvent, 'task_count'> & { event_tasks: Array<{ id: string; deleted_at: string | null }> | null };
      return ((data ?? []) as unknown as Row[]).map(({ event_tasks, ...event }) => ({
        ...event,
        event_sessions: event.event_sessions ?? [],
        task_count: (event_tasks ?? []).filter((task) => !task.deleted_at).length
      }));
    }
  });
}

export function useArchivedRequests(campus?: Campus) {
  return useQuery({
    queryKey: ['archive', 'requests', campus ?? 'ALL'],
    queryFn: async (): Promise<ArchivedRequest[]> => {
      let query = supabase
        .from('department_requests')
        .select('*, archived_by_profile:profiles!department_requests_archived_by_fkey(full_name)')
        .not('archived_at', 'is', null)
        .is('deleted_at', null)
        .order('archived_at', { ascending: false });
      if (campus) query = query.eq('campus', campus);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ArchivedRequest[];
    }
  });
}

/**
 * Archive, restore and delete. Each returns how many rows really changed: row
 * level security can quietly match nothing, and the screens say so rather than
 * reporting a success that did not happen.
 */
export function useArchiveMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    for (const key of ['archive', 'events', 'requests', 'dashboard', 'display', 'my-tasks']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const archiveEvents = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      let changed = 0;
      for (const batch of batches(ids)) {
        const { data, error } = await supabase
          .from('events')
          .update({ status: 'archived' })
          .in('id', batch)
          .neq('status', 'archived')
          .is('deleted_at', null)
          .select('id');
        if (error) throw error;
        changed += (data ?? []).length;
      }
      return changed;
    },
    onSettled: invalidate
  });

  /** Each event goes back to the status it had before it was archived */
  const restoreEvents = useMutation({
    mutationFn: async (events: Array<{ id: string; status_before_archive?: EventStatus | null }>): Promise<number> => {
      let changed = 0;
      for (const [status, ids] of groupByRestoreStatus(events)) {
        for (const batch of batches(ids)) {
          const { data, error } = await supabase
            .from('events')
            .update({ status })
            .in('id', batch)
            .eq('status', 'archived')
            .select('id');
          if (error) throw error;
          changed += (data ?? []).length;
        }
      }
      return changed;
    },
    onSettled: invalidate
  });

  /** The same soft delete as everywhere else, and only ever for archived events */
  const deleteEvents = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      let changed = 0;
      for (const batch of batches(ids)) {
        const { data, error } = await supabase
          .from('events')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', batch)
          .eq('status', 'archived')
          .is('deleted_at', null)
          .select('id');
        if (error) throw error;
        changed += (data ?? []).length;
      }
      return changed;
    },
    onSettled: invalidate
  });

  /** The database stamps the real time and user; any time sent here only means "archive" */
  const archiveRequests = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      let changed = 0;
      for (const batch of batches(ids)) {
        const { data, error } = await supabase
          .from('department_requests')
          .update({ archived_at: new Date().toISOString() })
          .in('id', batch)
          .is('archived_at', null)
          .is('deleted_at', null)
          .select('id');
        if (error) throw error;
        changed += (data ?? []).length;
      }
      return changed;
    },
    onSettled: invalidate
  });

  const restoreRequests = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      let changed = 0;
      for (const batch of batches(ids)) {
        const { data, error } = await supabase
          .from('department_requests')
          .update({ archived_at: null })
          .in('id', batch)
          .not('archived_at', 'is', null)
          .select('id');
        if (error) throw error;
        changed += (data ?? []).length;
      }
      return changed;
    },
    onSettled: invalidate
  });

  const deleteRequests = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      let changed = 0;
      for (const batch of batches(ids)) {
        const { data, error } = await supabase
          .from('department_requests')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', batch)
          .not('archived_at', 'is', null)
          .is('deleted_at', null)
          .select('id');
        if (error) throw error;
        changed += (data ?? []).length;
      }
      return changed;
    },
    onSettled: invalidate
  });

  /** Undo for a delete made a moment ago: the rows come back into the Archive folder */
  const undeleteEvents = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      let changed = 0;
      for (const batch of batches(ids)) {
        const { data, error } = await supabase
          .from('events')
          .update({ deleted_at: null })
          .in('id', batch)
          .eq('status', 'archived')
          .not('deleted_at', 'is', null)
          .select('id');
        if (error) throw error;
        changed += (data ?? []).length;
      }
      return changed;
    },
    onSettled: invalidate
  });

  const undeleteRequests = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      let changed = 0;
      for (const batch of batches(ids)) {
        const { data, error } = await supabase
          .from('department_requests')
          .update({ deleted_at: null })
          .in('id', batch)
          .not('archived_at', 'is', null)
          .not('deleted_at', 'is', null)
          .select('id');
        if (error) throw error;
        changed += (data ?? []).length;
      }
      return changed;
    },
    onSettled: invalidate
  });

  return {
    archiveEvents, restoreEvents, deleteEvents, undeleteEvents,
    archiveRequests, restoreRequests, deleteRequests, undeleteRequests
  };
}
