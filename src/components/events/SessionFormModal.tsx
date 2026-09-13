import { useEffect, useState } from 'react';
import { SessionFloorPlanPicker } from './SessionFloorPlanPicker';
import { useForm } from 'react-hook-form';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useSessionMutations } from '../../hooks/useSessions';
import { useTaskMutations } from '../../hooks/useTasks';
import { useAuth } from '../../contexts/AuthContext';
import { combineDateTime, extractTime } from '../../lib/utils';
import type { EventSession, EventTask } from '../../types';

interface SessionFormValues {
  floor_plan_attachment_id: string;
  title: string;
  session_date: string;
  location: string;
  start_time: string;
  end_time: string;
  /** Optional free text timing, e.g. "after school time" */
  time_note: string;
  /** Optional multi line operational note (OT, reminders, venue notes) */
  note: string;
}

interface SessionFormModalProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventDate: string;
  session?: EventSession | null;
  /** When set the modal saves a copy of this session instead of editing it */
  duplicateFrom?: EventSession | null;
  /** Tasks that belong to the session being duplicated */
  sourceTasks?: EventTask[];
  nextSortOrder: number;
}

export function SessionFormModal({
  open, onClose, eventId, eventDate, session, duplicateFrom, sourceTasks = [], nextSortOrder
}: SessionFormModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { createSession, updateSession } = useSessionMutations(eventId);
  const { createTasks } = useTaskMutations(eventId);

  const duplicating = !!duplicateFrom;
  const source = duplicateFrom ?? session ?? null;
  const [uploading, setUploading] = useState(false);
  const [copyTasks, setCopyTasks] = useState(true);
  const [resetStatus, setResetStatus] = useState(true);

  const { register, handleSubmit, reset, formState, watch, setValue } = useForm<SessionFormValues>({
    defaultValues: { floor_plan_attachment_id: '', title: '', session_date: eventDate, location: '', start_time: '', end_time: '', time_note: '', note: '' }
  });

  useEffect(() => {
    if (!open) return;
    setCopyTasks(true);
    setResetStatus(true);
    if (source) {
      reset({
        floor_plan_attachment_id: source.floor_plan_attachment_id ?? '',
        title: source.title,
        session_date: source.session_date,
        location: source.location,
        start_time: extractTime(source.start_time) ?? '',
        end_time: extractTime(source.end_time) ?? '',
        time_note: source.time_note ?? '',
        note: source.note ?? ''
      });
    } else {
      reset({ floor_plan_attachment_id: '', title: '', session_date: eventDate, location: '', start_time: '', end_time: '', time_note: '', note: '' });
    }
  }, [open, source, eventDate, reset]);

  const onSubmit = async (values: SessionFormValues) => {
    const payload = {
      floor_plan_attachment_id: values.floor_plan_attachment_id || null,
      title: values.title.trim(),
      session_date: values.session_date,
      location: values.location.trim(),
      start_time: combineDateTime(values.session_date, values.start_time || null),
      end_time: combineDateTime(values.session_date, values.end_time || null),
      time_note: values.time_note.trim(),
      note: values.note.trim()
    };
    try {
      if (duplicating) {
        const created = await createSession.mutateAsync({ ...payload, sort_order: nextSortOrder });
        if (copyTasks && sourceTasks.length > 0) {
          await createTasks.mutateAsync(
            sourceTasks.map((task) => ({
              event_id: eventId,
              department_id: task.department_id,
              session_id: created.id,
              title: task.title,
              description: task.description,
              instructions: task.instructions,
              work_location: task.work_location,
              setup_location: task.setup_location,
              assigned_staff: task.assigned_staff,
              start_time: combineDateTime(values.session_date, extractTime(task.start_time)),
              completion_time: combineDateTime(values.session_date, extractTime(task.completion_time)),
              priority: task.priority,
              status: resetStatus ? 'not_started' : task.status,
              notes: task.notes,
              sort_order: task.sort_order,
              created_by: profile?.id ?? null
            }))
          );
        }
        toast(t('sessions.duplicated'));
      } else if (session) {
        await updateSession.mutateAsync({ id: session.id, ...payload });
        toast(t('common.savedSuccess'));
      } else {
        await createSession.mutateAsync({ ...payload, sort_order: nextSortOrder });
        toast(t('common.savedSuccess'));
      }
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const title = duplicating
    ? t('sessions.duplicateSession')
    : session
      ? t('sessions.editSession')
      : t('sessions.addSession');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={duplicating ? t('sessions.duplicateHint') : t('sessions.hint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={uploading}
            loading={createSession.isPending || updateSession.isPending || createTasks.isPending}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <Input label={t('sessions.sessionTitle')} {...register('title')} className="sm:col-span-2" />
        <Input
          label={t('common.date')}
          type="date"
          required
          error={formState.errors.session_date && t('validation.dateRequired')}
          {...register('session_date', { required: true })}
        />
        <Input label={t('common.location')} {...register('location')} />
        <Input label={t('tasks.startTime')} type="time" {...register('start_time')} />
        <Input label={t('tasks.completionTime')} type="time" {...register('end_time')} />
        {/* Free text timing for anything a clock cannot express */}
        <Input
          label={t('events.timingNote')}
          placeholder={t('events.timingNote')}
          className="sm:col-span-2"
          {...register('time_note')}
        />
        {/* Operational note shown on the board under this session */}
        <Textarea
          label={t('sessions.sessionNote')}
          hint={t('sessions.sessionNoteHint')}
          className="sm:col-span-2"
          {...register('note')}
        />

        <SessionFloorPlanPicker eventId={eventId} value={watch('floor_plan_attachment_id')} onChange={id => setValue('floor_plan_attachment_id', id, { shouldDirty: true })} onUploading={setUploading} />

        {duplicating && sourceTasks.length > 0 && (
          <div className="space-y-2 rounded-xl border border-gold-200 bg-gold-50/60 p-3 sm:col-span-2 dark:border-gold-900 dark:bg-gold-950/20">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={copyTasks}
                onChange={(event) => setCopyTasks(event.target.checked)}
                className="h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
              />
              {t('sessions.copyTasksToo')} ({sourceTasks.length})
            </label>
            {copyTasks && (
              <label className="flex cursor-pointer items-center gap-2 pl-6 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={resetStatus}
                  onChange={(event) => setResetStatus(event.target.checked)}
                  className="h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
                />
                {t('sessions.resetStatus')}
              </label>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
