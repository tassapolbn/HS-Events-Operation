import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useSessionMutations } from '../../hooks/useSessions';
import { combineDateTime, extractTime } from '../../lib/utils';
import type { EventSession } from '../../types';

interface SessionFormValues {
  title: string;
  session_date: string;
  location: string;
  start_time: string;
  end_time: string;
  /** Optional free text timing, e.g. "after school time" */
  time_note: string;
}

interface SessionFormModalProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventDate: string;
  session?: EventSession | null;
  nextSortOrder: number;
}

export function SessionFormModal({ open, onClose, eventId, eventDate, session, nextSortOrder }: SessionFormModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { createSession, updateSession } = useSessionMutations(eventId);

  const { register, handleSubmit, reset, formState } = useForm<SessionFormValues>({
    defaultValues: { title: '', session_date: eventDate, location: '', start_time: '', end_time: '', time_note: '' }
  });

  useEffect(() => {
    if (!open) return;
    if (session) {
      reset({
        title: session.title,
        session_date: session.session_date,
        location: session.location,
        start_time: extractTime(session.start_time) ?? '',
        end_time: extractTime(session.end_time) ?? '',
        time_note: session.time_note ?? ''
      });
    } else {
      reset({ title: '', session_date: eventDate, location: '', start_time: '', end_time: '', time_note: '' });
    }
  }, [open, session, eventDate, reset]);

  const onSubmit = async (values: SessionFormValues) => {
    const payload = {
      title: values.title.trim(),
      session_date: values.session_date,
      location: values.location.trim(),
      start_time: combineDateTime(values.session_date, values.start_time || null),
      end_time: combineDateTime(values.session_date, values.end_time || null),
      time_note: values.time_note.trim()
    };
    try {
      if (session) {
        await updateSession.mutateAsync({ id: session.id, ...payload });
      } else {
        await createSession.mutateAsync({ ...payload, sort_order: nextSortOrder });
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
      title={session ? t('sessions.editSession') : t('sessions.addSession')}
      subtitle={t('sessions.hint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={createSession.isPending || updateSession.isPending}>
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
      </form>
    </Modal>
  );
}
