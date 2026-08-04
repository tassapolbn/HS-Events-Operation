import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { Campus, EventWithTasks, TaskStatus } from '../types';

export interface DashboardData {
  todayEvents: EventWithTasks[];
  upcomingEvents: EventWithTasks[];
  monthEvents: { id: string; event_date: string; status: string }[];
  pendingTasks: number;
  completedTasks: number;
  workload: Record<string, { open: number; total: number }>;
}

const OPEN_STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'waiting'];

export function useDashboard(campus?: Campus) {
  return useQuery({
    queryKey: ['dashboard', campus ?? 'ALL'],
    refetchInterval: 120_000,
    queryFn: async (): Promise<DashboardData> => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const horizon = format(addDays(new Date(), 14), 'yyyy-MM-dd');
      const monthStart = format(new Date(), 'yyyy-MM-01');
      const monthEnd = format(addDays(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 0), 'yyyy-MM-dd');

      // Campus scoping: events and department_requests carry campus directly.
      // event_tasks has no campus column, so we scope it through its parent
      // event via an inner join when a single campus is selected.
      let eventsQ = supabase
        .from('events')
        .select('*, event_tasks(id, department_id, status, assigned_staff, title, deleted_at)')
        .is('deleted_at', null)
        .neq('status', 'archived')
        .gte('event_date', today)
        .lte('event_date', horizon)
        .order('event_date');
      let tasksQ = supabase
        .from('event_tasks')
        .select(campus ? 'department_id, status, events!inner(campus)' : 'department_id, status')
        .is('deleted_at', null);
      let requestsQ = supabase.from('department_requests').select('department_id, status').is('deleted_at', null);
      let monthQ = supabase
        .from('events')
        .select('id, event_date, status')
        .is('deleted_at', null)
        .gte('event_date', monthStart)
        .lte('event_date', monthEnd);

      if (campus) {
        eventsQ = eventsQ.eq('campus', campus);
        tasksQ = tasksQ.eq('events.campus', campus);
        requestsQ = requestsQ.eq('campus', campus);
        monthQ = monthQ.eq('campus', campus);
      }

      const [eventsRes, tasksRes, requestsRes, monthRes] = await Promise.all([eventsQ, tasksQ, requestsQ, monthQ]);

      if (eventsRes.error) throw eventsRes.error;

      const events = ((eventsRes.data ?? []) as EventWithTasks[]).map((event) => ({
        ...event,
        event_tasks: (event.event_tasks ?? []).filter((task) => !task.deleted_at)
      }));

      // Cast via unknown: the conditional embed select ('events!inner(campus)')
      // widens the parsed row type, so we normalise to the fields we use.
      const tasks = (tasksRes.data ?? []) as unknown as { department_id: string; status: TaskStatus }[];
      const requests = (requestsRes.data ?? []) as { department_id: string; status: TaskStatus }[];
      const combined = [...tasks, ...requests];

      const workload: Record<string, { open: number; total: number }> = {};
      for (const item of combined) {
        if (!workload[item.department_id]) workload[item.department_id] = { open: 0, total: 0 };
        workload[item.department_id].total += 1;
        if (OPEN_STATUSES.includes(item.status)) workload[item.department_id].open += 1;
      }

      return {
        todayEvents: events.filter((event) => event.event_date === today),
        upcomingEvents: events.filter((event) => event.event_date > today),
        monthEvents: (monthRes.data ?? []) as { id: string; event_date: string; status: string }[],
        pendingTasks: combined.filter((item) => OPEN_STATUSES.includes(item.status)).length,
        completedTasks: combined.filter((item) => item.status === 'completed').length,
        workload
      };
    }
  });
}
