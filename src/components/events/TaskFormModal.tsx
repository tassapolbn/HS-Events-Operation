import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { RichTextEditor } from '../editor/RichTextEditor';
import { useLanguage } from '../../i18n';
import { useTaskMutations } from '../../hooks/useTasks';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { PRIORITIES, TASK_STATUSES } from '../../lib/constants';
import { combineDateTime, extractTime } from '../../lib/utils';
import type { Department, EventSession, EventTask, Priority, TaskStatus } from '../../types';
import { formatDate } from '../../lib/utils';

interface TaskFormValues {
  title: string;
  department_id: string;
  session_id: string;
  description: string;
  instructions: string;
  work_location: string;
  setup_location: string;
  assigned_staff: string;
  start_time: string;
  completion_time: string;
  priority: Priority;
  status: TaskStatus;
}

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventDate: string;
  departments: Department[];
  sessions: EventSession[];
  /** Preselected department when adding from a section */
  defaultDepartmentId?: string;
  defaultSessionId?: string | null;
  /** When set, the modal edits this task */
  task?: EventTask | null;
  /** The event's Additional Notes (whole event), editable at the bottom of the form */
  eventNotes: string;
  onSaveEventNotes: (html: string) => Promise<void>;
}

export function TaskFormModal({ open, onClose, eventId, eventDate, departments, sessions, defaultDepartmentId, defaultSessionId, task, eventNotes, onSaveEventNotes }: TaskFormModalProps) {
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { createTask, updateTask } = useTaskMutations(eventId);
  const [notesDraft, setNotesDraft] = useState(eventNotes);

  const { register, handleSubmit, control, reset, formState } = useForm<TaskFormValues>({
    defaultValues: emptyValues(defaultDepartmentId, defaultSessionId)
  });

  useEffect(() => {
    if (open) setNotesDraft(eventNotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (task) {
      reset({
        title: task.title,
        department_id: task.department_id,
        session_id: task.session_id ?? '',
        description: task.description,
        instructions: task.instructions,
        work_location: task.work_location,
        setup_location: task.setup_location,
        assigned_staff: task.assigned_staff,
        start_time: extractTime(task.start_time) ?? '',
        completion_time: extractTime(task.completion_time) ?? '',
        priority: task.priority,
        status: task.status
      });
    } else {
      reset(emptyValues(defaultDepartmentId, defaultSessionId));
    }
  }, [open, task, defaultDepartmentId, defaultSessionId, reset]);

  const onSubmit = async (values: TaskFormValues) => {
    const taskDate = sessions.find(session => session.id === values.session_id)?.session_date || eventDate;
    const payload = {
      title: values.title.trim(),
      department_id: values.department_id,
      session_id: values.session_id || null,
      description: values.description,
      instructions: values.instructions,
      work_location: values.work_location.trim(),
      setup_location: values.setup_location.trim(),
      assigned_staff: values.assigned_staff.trim(),
      start_time: combineDateTime(taskDate, values.start_time || null),
      completion_time: combineDateTime(taskDate, values.completion_time || null),
      priority: values.priority,
      status: values.status
    };
    try {
      if (task) {
        await updateTask.mutateAsync({ id: task.id, ...payload });
      } else {
        await createTask.mutateAsync({ ...payload, event_id: eventId, created_by: profile?.id ?? null });
      }
      if (notesDraft !== eventNotes) {
        await onSaveEventNotes(notesDraft);
      }
      toast(t('common.savedSuccess'));
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <Modal
      onConfirm={handleSubmit(onSubmit)}
      confirmDisabled={createTask.isPending || updateTask.isPending || formState.isSubmitting}
      open={open}
      onClose={onClose}
      title={task ? t('tasks.editTask') : t('tasks.addTask')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={createTask.isPending || updateTask.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('tasks.taskTitle')}
            required
            error={formState.errors.title && t('validation.required')}
            {...register('title', { required: true })}
            className="sm:col-span-2"
          />
          <Select label={t('common.department')} required {...register('department_id', { required: true })}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{deptName(d)}</option>
            ))}
          </Select>
          {sessions.length > 0 && (
            <Select label={t('sessions.title')} {...register('session_id')}>
              <option value="">{t('sessions.whole')}</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatDate(session.session_date, lang, 'd MMM')}
                  {session.location ? ` - ${session.location}` : ''}
                  {session.title ? ` (${session.title})` : ''}
                </option>
              ))}
            </Select>
          )}
          <Input label={t('tasks.assignedStaff')} {...register('assigned_staff')} />
          <Input label={t('tasks.workLocation')} {...register('work_location')} />
          <Input label={t('tasks.setupLocation')} {...register('setup_location')} />
          <Input label={t('tasks.startTime')} type="time" {...register('start_time')} />
          <Input label={t('tasks.completionTime')} type="time" {...register('completion_time')} />
          <Select label={t('common.priority')} {...register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{t(`priority.${p}`)}</option>
            ))}
          </Select>
          <Select label={t('common.status')} {...register('status')}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>
            ))}
          </Select>
        </div>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('tasks.taskDescription')}
              </label>
              <RichTextEditor value={field.value} onChange={field.onChange} />
            </div>
          )}
        />
        <Controller
          control={control}
          name="instructions"
          render={({ field }) => (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('tasks.instructions')}
              </label>
              <RichTextEditor value={field.value} onChange={field.onChange} />
            </div>
          )}
        />

        {/* Whole-event Additional Notes */}
        <div className="space-y-1.5 rounded-xl border border-gold-200 bg-gold-50/60 p-3 dark:border-gold-900 dark:bg-gold-950/20">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-400">
            {t('events.additionalNotes')}
          </label>
          <p className="text-xs text-slate-400">{t('tasks.eventNotesHint')}</p>
          <RichTextEditor value={notesDraft} onChange={setNotesDraft} />
        </div>
      </form>
    </Modal>
  );
}

function emptyValues(defaultDepartmentId?: string, defaultSessionId?: string | null): TaskFormValues {
  return {
    title: '',
    department_id: defaultDepartmentId ?? '',
    session_id: defaultSessionId ?? '',
    description: '',
    instructions: '',
    work_location: '',
    setup_location: '',
    assigned_staff: '',
    start_time: '',
    completion_time: '',
    priority: 'medium',
    status: 'not_started'
  };
}
