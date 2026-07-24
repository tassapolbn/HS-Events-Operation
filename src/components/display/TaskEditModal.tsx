import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useTaskMutations } from '../../hooks/useTasks';
import { TASK_STATUSES } from '../../lib/constants';
import { combineDateTime, extractDate, extractTime, formatDate } from '../../lib/utils';
import type { DisplayDepartment, DisplayEvent, DisplayTask, TaskStatus } from '../../types';

interface TaskEditValues {
  title: string;
  department_id: string;
  session_id: string;
  assigned_staff: string;
  work_location: string;
  setup_location: string;
  start_time: string;
  completion_time: string;
  status: TaskStatus;
}

interface TaskEditModalProps {
  open: boolean;
  onClose: () => void;
  event: DisplayEvent | null;
  task: DisplayTask | null;
  departments: DisplayDepartment[];
}

/** Compact task editor for the display board. Writes the same event_tasks table. */
export function TaskEditModal({ open, onClose, event, task, departments }: TaskEditModalProps) {
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { updateTask } = useTaskMutations(event?.id);
  const { register, handleSubmit, reset, formState } = useForm<TaskEditValues>({
    defaultValues: {
      title: '',
      department_id: '',
      session_id: '',
      assigned_staff: '',
      work_location: '',
      setup_location: '',
      start_time: '',
      completion_time: '',
      status: 'not_started'
    }
  });

  useEffect(() => {
    if (!open || !task) return;
    reset({
      title: task.title,
      department_id: task.department_id,
      session_id: task.session_id ?? '',
      assigned_staff: task.assigned_staff,
      work_location: task.work_location,
      setup_location: task.setup_location,
      start_time: extractTime(task.start_time) ?? '',
      completion_time: extractTime(task.completion_time) ?? '',
      status: task.status
    });
  }, [open, task, reset]);

  const onSubmit = async (values: TaskEditValues) => {
    if (!event || !task) return;
    // Keep the milestone's own day: use the chosen session's date, or the day
    // the task already had, then fall back to the event date.
    const sessionDate = values.session_id
      ? event.sessions.find((s) => s.id === values.session_id)?.session_date
      : undefined;
    const baseDate = sessionDate || extractDate(task.start_time) || event.event_date;
    try {
      await updateTask.mutateAsync({
        id: task.id,
        title: values.title.trim(),
        department_id: values.department_id,
        session_id: values.session_id || null,
        assigned_staff: values.assigned_staff.trim(),
        work_location: values.work_location.trim(),
        setup_location: values.setup_location.trim(),
        start_time: combineDateTime(baseDate, values.start_time || null),
        completion_time: combineDateTime(baseDate, values.completion_time || null),
        status: values.status
      });
      toast(t('common.savedSuccess'));
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const sessions = event?.sessions ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tasks.editTask')}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={updateTask.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <Input
          label={t('tasks.taskTitle')}
          required
          error={formState.errors.title && t('validation.required')}
          className="sm:col-span-2"
          {...register('title', { required: true })}
        />
        <Select label={t('common.department')} required {...register('department_id', { required: true })}>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {deptName(d)}
            </option>
          ))}
        </Select>
        {sessions.length > 0 && (
          <Select label={t('sessions.title')} {...register('session_id')}>
            <option value="">{t('sessions.whole')}</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDate(s.session_date, lang, 'd MMM')}
                {s.location ? ` - ${s.location}` : ''}
                {s.title ? ` (${s.title})` : ''}
              </option>
            ))}
          </Select>
        )}
        <Input label={t('tasks.assignedStaff')} {...register('assigned_staff')} />
        <Select label={t('common.status')} {...register('status')}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`taskStatus.${s}`)}
            </option>
          ))}
        </Select>
        <Input label={t('tasks.workLocation')} {...register('work_location')} />
        <Input label={t('tasks.setupLocation')} {...register('setup_location')} />
        <Input label={t('tasks.startTime')} type="time" {...register('start_time')} />
        <Input label={t('tasks.completionTime')} type="time" {...register('completion_time')} />
      </form>
    </Modal>
  );
}
