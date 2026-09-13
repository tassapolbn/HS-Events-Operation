import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { combineDateTime, dayDiff, extractTime, shiftDate } from '../lib/utils';
import type { Attachment, Department, EventTemplate, EventWithTasks, TemplateData } from '../types';

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async (): Promise<EventTemplate[]> => {
      const { data, error } = await supabase
        .from('event_templates')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventTemplate[];
    }
  });
}

interface SaveTemplateArgs {
  name: string;
  description: string;
  event: EventWithTasks;
  departments: Department[];
  attachments: Attachment[];
  includeAttachments: boolean;
  checklistsByTask: Record<string, string[]>;
  userId: string;
}

export function useTemplateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const saveTemplate = useMutation({
    mutationFn: async (args: SaveTemplateArgs) => {
      const deptCode = (id: string) => args.departments.find((d) => d.id === id)?.code ?? '';
      const sessions = args.event.event_sessions ?? [];
      const sessionIndexById = new Map(sessions.map((session, index) => [session.id, index]));
      const data: TemplateData = {
        event: {
          name: args.event.name,
          category: args.event.category,
          location: args.event.location,
          description: args.event.description,
          additional_notes: args.event.additional_notes,
          internal_notes: args.event.internal_notes,
          priority: args.event.priority,
          times: {
            setup_start: extractTime(args.event.setup_start),
            venue_ready: extractTime(args.event.venue_ready),
            event_start: extractTime(args.event.event_start),
            event_finish: extractTime(args.event.event_finish),
            breakdown_start: extractTime(args.event.breakdown_start),
            breakdown_deadline: extractTime(args.event.breakdown_deadline)
          }
        },
        sessions: sessions.map((session) => ({
          title: session.title,
          day_offset: dayDiff(args.event.event_date, session.session_date),
          location: session.location,
          start_time: extractTime(session.start_time),
          end_time: extractTime(session.end_time),
          time_note: session.time_note ?? '',
          note: session.note ?? '',
          sort_order: session.sort_order
        })),
        tasks: args.event.event_tasks.map((task) => ({
          department_code: deptCode(task.department_id),
          title: task.title,
          description: task.description,
          instructions: task.instructions,
          work_location: task.work_location,
          setup_location: task.setup_location,
          assigned_staff: task.assigned_staff,
          priority: task.priority,
          start_time: extractTime(task.start_time),
          completion_time: extractTime(task.completion_time),
          checklist: args.checklistsByTask[task.id] ?? [],
          session_index: task.session_id != null ? sessionIndexById.get(task.session_id) ?? null : null,
          notes: task.notes
        })),
        attachments: args.includeAttachments
          ? args.attachments.map((a) => ({
              file_name: a.file_name,
              storage_path: a.storage_path,
              mime_type: a.mime_type,
              size_bytes: a.size_bytes
            }))
          : []
      };
      const { error } = await supabase.from('event_templates').insert({
        name: args.name,
        description: args.description,
        data,
        created_by: args.userId
      });
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_templates')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const createEventFromTemplate = useMutation({
    mutationFn: async ({
      template,
      eventDate,
      departments,
      userId
    }: {
      template: EventTemplate;
      eventDate: string;
      departments: Department[];
      userId: string;
    }): Promise<string> => {
      const d = template.data;
      const times = d.event.times ?? {};
      const { data: eventRow, error: eventError } = await supabase
        .from('events')
        .insert({
          name: d.event.name,
          category: d.event.category,
          event_date: eventDate,
          location: d.event.location,
          description: d.event.description,
          additional_notes: d.event.additional_notes,
          internal_notes: d.event.internal_notes,
          priority: d.event.priority,
          status: 'draft',
          setup_start: combineDateTime(eventDate, times.setup_start ?? null),
          venue_ready: combineDateTime(eventDate, times.venue_ready ?? null),
          event_start: combineDateTime(eventDate, times.event_start ?? null),
          event_finish: combineDateTime(eventDate, times.event_finish ?? null),
          breakdown_start: combineDateTime(eventDate, times.breakdown_start ?? null),
          breakdown_deadline: combineDateTime(eventDate, times.breakdown_deadline ?? null),
          created_by: userId
        })
        .select()
        .single();
      if (eventError) throw eventError;
      const eventId = eventRow.id as string;

      // Recreate the sessions first, keeping their day offsets, so tasks can be grouped again
      const sessionIds: string[] = [];
      for (const session of d.sessions ?? []) {
        const sessionDate = shiftDate(eventDate, session.day_offset ?? 0);
        const { data: sessionRow, error: sessionError } = await supabase
          .from('event_sessions')
          .insert({
            event_id: eventId,
            title: session.title,
            session_date: sessionDate,
            location: session.location,
            start_time: combineDateTime(sessionDate, session.start_time ?? null),
            end_time: combineDateTime(sessionDate, session.end_time ?? null),
            time_note: session.time_note ?? '',
            note: session.note ?? '',
            sort_order: session.sort_order
          })
          .select('id')
          .single();
        if (sessionError) throw sessionError;
        sessionIds.push(sessionRow.id as string);
      }

      for (const [index, task] of d.tasks.entries()) {
        const dept = departments.find((x) => x.code === task.department_code);
        if (!dept) continue;
        const { data: taskRow, error: taskError } = await supabase
          .from('event_tasks')
          .insert({
            event_id: eventId,
            department_id: dept.id,
            title: task.title,
            description: task.description,
            instructions: task.instructions,
            work_location: task.work_location,
            setup_location: task.setup_location,
            assigned_staff: task.assigned_staff,
            priority: task.priority,
            start_time: combineDateTime(eventDate, task.start_time),
            completion_time: combineDateTime(eventDate, task.completion_time),
            notes: task.notes ?? '',
            session_id:
              task.session_index != null && task.session_index >= 0
                ? sessionIds[task.session_index] ?? null
                : null,
            sort_order: index,
            created_by: userId
          })
          .select()
          .single();
        if (taskError) throw taskError;
        if (task.checklist.length > 0) {
          const items = task.checklist.map((label, i) => ({
            task_id: taskRow.id,
            label,
            sort_order: i
          }));
          const { error: checklistError } = await supabase.from('task_checklist_items').insert(items);
          if (checklistError) throw checklistError;
        }
      }

      if (d.attachments.length > 0) {
        const rows = d.attachments.map((a) => ({
          entity_type: 'event',
          entity_id: eventId,
          file_name: a.file_name,
          storage_path: a.storage_path,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          uploaded_by: userId
        }));
        const { error: attachError } = await supabase.from('attachments').insert(rows);
        if (attachError) throw attachError;
      }

      return eventId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] })
  });

  return { saveTemplate, deleteTemplate, createEventFromTemplate };
}
