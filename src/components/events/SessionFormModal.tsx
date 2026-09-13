import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useSessionMutations } from '../../hooks/useSessions';
import { useTaskMutations } from '../../hooks/useTasks';
import { combineDateTime, extractTime } from '../../lib/utils';
import type { EventSession, EventTask } from '../../types';

interface SessionFormValues {
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
  copySource?: EventSession | null;
  sourceTasks?: EventTask[];
  nextSortOrder: number;
}

export function SessionFormModal({ open, onClose, eventId, eventDate, session, copySource, sourceTasks = [], nextSortOrder }: SessionFormModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { createSession, updateSession } = useSessionMutations(eventId);
  const { createTask } = useTaskMutations(eventId);

  const { register, handleSubmit, reset, formState } = useForm<SessionFormValues>({
    defaultValues: { title: '', session_date: eventDate, location: '', start_time: '', end_time: '', time_note: '', note: '' }
  });

  useEffect(() => {
    if (!open) return;
    const initial = session ?? copySource;
    if (initial) {
      reset({
        title: copySource ? `${initial.title} (${t('common.copy')})` : initial.title,
        session_date: initial.session_date,
        location: initial.location,
        start_time: extractTime(initial.start_time) ?? '',
        end_time: extractTime(initial.end_time) ?? '',
        time_note: initial.time_note ?? '',
        note: initial.note ?? ''
      });
    } else {
      reset({ title: '', session_date: eventDate, location: '', start_time: '', end_time: '', time_note: '', note: '' });
    }
  }, [open, session, copySource, eventDate, reset, t]);

  const onSubmit = async (values: SessionFormValues) => {
    const payload = {
      title: values.title.trim(),
      session_date: values.session_date,
      location: values.location.trim(),
      start_time: combineDateTime(values.session_date, values.start_time || null),
      end_time: combineDateTime(values.session_date, values.end_time || null),
      time_note: values.time_note.trim(),
      note: values.note.trim()
    };
    try {
      if (session && !copySource) {
        await updateSession.mutateAsync({ id: session.id, ...payload });
      } else {
        const created = await createSession.mutateAsync({ ...payload, sort_order: nextSortOrder });
        if (copySource) {
          for (const task of sourceTasks) {
            const { id: _id, created_at: _created, updated_at: _updated, deleted_at: _deleted, ...copy } = task;
            await createTask.mutateAsync({
              ...copy,
              session_id: created.id,
              status: 'not_started',
              start_time: combineDateTime(values.session_date, extractTime(task.start_time)),
              completion_time: combineDateTime(values.session_date, extractTime(task.completion_time))
            });
          }
        }
      }
      toast(t('common.savedSuccess'));
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copySource ? t('sessions.copySession') : session ? t('sessions.editSession') : t('sessions.addSession')}
      subtitle={t('sessions.hint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={createSession.isPending || updateSession.isPending || createTask.isPending}>
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
      </form>
    </Modal>
  );
}
