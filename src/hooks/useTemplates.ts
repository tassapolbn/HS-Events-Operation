import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { combineDateTime, dayDiff, extractDate, extractTime, shiftDate } from '../lib/utils';
import type { Attachment, Campus, Department, EventContact, EventTemplate, EventWithTasks, TemplateData } from '../types';

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

const MILESTONES = ['setup_start', 'venue_ready', 'event_start', 'event_finish', 'breakdown_start', 'breakdown_deadline'] as const;

/** How many days after `base` (yyyy-MM-dd) a stored time falls on; 0 when there is no time */
function daysAfter(base: string, value: string | null): number {
  const date = extractDate(value);
  return date ? dayDiff(base, date) : 0;
}

export interface TemplateBuildOptions {
  /**
   * Copying a past event: also keep which day each time falls on and each
   * session's floor plan, so a three-day event copies as the same three days.
   * Saved templates leave this off and keep working as before.
   */
  exactCopy?: boolean;
}

/** Build reusable event content; checklist labels are loaded separately by the caller. */
export function templateDataFromEvent(
  event: EventWithTasks,
  departments: Department[],
  attachments: Attachment[],
  includeAttachments: boolean,
  checklistsByTask: Record<string, string[]> = {},
  options: TemplateBuildOptions = {}
): TemplateData {
  const deptCode = (id: string) => departments.find((d) => d.id === id)?.code ?? '';
  const sessions = event.event_sessions ?? [];
  const sessionIndexById = new Map(sessions.map((session, index) => [session.id, index]));
  const exact = options.exactCopy === true;
  const files = includeAttachments ? attachments : [];
  const planIndex = (attachmentId: string | null | undefined) => {
    const index = attachmentId ? files.findIndex((file) => file.id === attachmentId) : -1;
    return index >= 0 ? index : null;
  };
  return {
    event: {
      name: event.name,
      category: event.category,
      location: event.location,
      description: event.description,
      additional_notes: event.additional_notes,
      internal_notes: event.internal_notes,
      priority: event.priority,
      times: {
        setup_start: extractTime(event.setup_start),
        venue_ready: extractTime(event.venue_ready),
        event_start: extractTime(event.event_start),
        event_finish: extractTime(event.event_finish),
        breakdown_start: extractTime(event.breakdown_start),
        breakdown_deadline: extractTime(event.breakdown_deadline)
      },
      // A three-day event makes three-day events
      duration_days: event.end_date ? Math.max(0, dayDiff(event.event_date, event.end_date)) : 0,
      ...(exact && {
        time_day_offsets: Object.fromEntries(MILESTONES.map((field) => [field, daysAfter(event.event_date, event[field])]))
      })
    },
    sessions: sessions.map((session) => ({
      title: session.title,
      day_offset: dayDiff(event.event_date, session.session_date),
      location: session.location,
      start_time: extractTime(session.start_time),
      end_time: extractTime(session.end_time),
      time_note: session.time_note ?? '',
      note: session.note ?? '',
      sort_order: session.sort_order,
      ...(exact && {
        start_day_offset: daysAfter(session.session_date, session.start_time),
        end_day_offset: daysAfter(session.session_date, session.end_time),
        floor_plan_index: planIndex(session.floor_plan_attachment_id)
      })
    })),
    tasks: event.event_tasks.map((task) => ({
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
      ...(exact && {
        start_day_offset: daysAfter(event.event_date, task.start_time),
        completion_day_offset: daysAfter(event.event_date, task.completion_time)
      }),
      checklist: checklistsByTask[task.id] ?? [],
      session_index: task.session_id != null ? sessionIndexById.get(task.session_id) ?? null : null,
      notes: task.notes
    })),
    attachments: files.map((a) => ({
      file_name: a.file_name,
      storage_path: a.storage_path,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes
    }))
  };
}

export function useTemplateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const saveTemplate = useMutation({
    mutationFn: async (args: SaveTemplateArgs) => {
      const data = templateDataFromEvent(
        args.event, args.departments, args.attachments, args.includeAttachments, args.checklistsByTask
      );
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
      userId,
      overrides
    }: {
      template: EventTemplate;
      eventDate: string;
      departments: Department[];
      userId: string;
      overrides?: {
        name?: string;
        campus?: Campus;
        header_color?: string;
        header_text_color?: string;
        contacts?: EventContact[];
      };
    }): Promise<string> => {
      const d = template.data;
      const times = d.event.times ?? {};
      const timeOffsets = d.event.time_day_offsets ?? {};
      // A milestone on the day its source fell on: the event date unless the copy kept its day
      const milestone = (field: string) =>
        combineDateTime(shiftDate(eventDate, timeOffsets[field] ?? 0), times[field] ?? null);
      const { data: eventRow, error: eventError } = await supabase
        .from('events')
        .insert({
          name: d.event.name,
          category: d.event.category,
          event_date: eventDate,
          end_date: (d.event.duration_days ?? 0) > 0 ? shiftDate(eventDate, d.event.duration_days ?? 0) : null,
          location: d.event.location,
          description: d.event.description,
          additional_notes: d.event.additional_notes,
          internal_notes: d.event.internal_notes,
          priority: d.event.priority,
          status: 'draft',
          setup_start: milestone('setup_start'),
          venue_ready: milestone('venue_ready'),
          event_start: milestone('event_start'),
          event_finish: milestone('event_finish'),
          breakdown_start: milestone('breakdown_start'),
          breakdown_deadline: milestone('breakdown_deadline'),
          created_by: userId,
          ...overrides
        })
        .select()
        .single();
      if (eventError) throw eventError;
      const eventId = eventRow.id as string;

      // Files go in before the sessions, so a copied session can point at its own floor plan again
      const attachmentIds: Array<string | null> = [];
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
        const { data: inserted, error: attachError } = await supabase.from('attachments').insert(rows).select('id, storage_path');
        if (attachError) throw attachError;
        // Matched by file path, not by the order the rows come back in
        const unclaimed = [...(inserted ?? [])] as Array<{ id: string; storage_path: string }>;
        for (const a of d.attachments) {
          const at = unclaimed.findIndex((row) => row.storage_path === a.storage_path);
          attachmentIds.push(at >= 0 ? unclaimed.splice(at, 1)[0].id : null);
        }
      }

      // Recreate the sessions next, keeping their day offsets, so tasks can be grouped again
      const sessionIds: string[] = [];
      for (const session of d.sessions ?? []) {
        const sessionDate = shiftDate(eventDate, session.day_offset ?? 0);
        const floorPlanId = session.floor_plan_index != null ? attachmentIds[session.floor_plan_index] ?? null : null;
        const { data: sessionRow, error: sessionError } = await supabase
          .from('event_sessions')
          .insert({
            event_id: eventId,
            title: session.title,
            session_date: sessionDate,
            location: session.location,
            start_time: combineDateTime(shiftDate(sessionDate, session.start_day_offset ?? 0), session.start_time ?? null),
            end_time: combineDateTime(shiftDate(sessionDate, session.end_day_offset ?? 0), session.end_time ?? null),
            time_note: session.time_note ?? '',
            note: session.note ?? '',
            sort_order: session.sort_order,
            ...(floorPlanId && { floor_plan_attachment_id: floorPlanId })
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
            start_time: combineDateTime(shiftDate(eventDate, task.start_day_offset ?? 0), task.start_time),
            completion_time: combineDateTime(shiftDate(eventDate, task.completion_day_offset ?? 0), task.completion_time),
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

      return eventId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] })
  });

  return { saveTemplate, deleteTemplate, createEventFromTemplate };
}
