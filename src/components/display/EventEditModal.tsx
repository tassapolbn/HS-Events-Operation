import { useEffect } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useEventMutations } from '../../hooks/useEvents';
import { EVENT_STATUSES } from '../../lib/constants';
import { combineDateTime, extractDate, extractTime } from '../../lib/utils';
import type { DisplayEvent, EventStatus } from '../../types';

const MILESTONES = [
  { key: 'setup_start', label: 'events.setupStart' },
  { key: 'venue_ready', label: 'events.venueReady' },
  { key: 'event_start', label: 'events.eventStart' },
  { key: 'event_finish', label: 'events.eventFinish' },
  { key: 'breakdown_start', label: 'events.breakdownStart' },
  { key: 'breakdown_deadline', label: 'events.breakdownDeadline' }
] as const;

type MilestoneKey = (typeof MILESTONES)[number]['key'];

interface Slot {
  date: string;
  time: string;
  note: string;
}

interface EventEditValues {
  name: string;
  status: EventStatus;
  event_date: string;
  location: string;
  schedule: Record<MilestoneKey, Slot>;
}

function emptySchedule(): Record<MilestoneKey, Slot> {
  return {
    setup_start: { date: '', time: '', note: '' },
    venue_ready: { date: '', time: '', note: '' },
    event_start: { date: '', time: '', note: '' },
    event_finish: { date: '', time: '', note: '' },
    breakdown_start: { date: '', time: '', note: '' },
    breakdown_deadline: { date: '', time: '', note: '' }
  };
}

interface EventEditModalProps {
  open: boolean;
  onClose: () => void;
  event: DisplayEvent | null;
}

/** Compact event editor for the display board. Deeper fields open the full editor. */
export function EventEditModal({ open, onClose, event }: EventEditModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { updateEvent } = useEventMutations();
  const { register, handleSubmit, reset, formState } = useForm<EventEditValues>({
    defaultValues: { name: '', status: 'scheduled', event_date: '', location: '', schedule: emptySchedule() }
  });

  useEffect(() => {
    if (!open || !event) return;
    const schedule = emptySchedule();
    for (const m of MILESTONES) {
      const iso = event[m.key];
      const date = extractDate(iso) ?? '';
      schedule[m.key] = {
        date: date === event.event_date ? '' : date,
        time: extractTime(iso) ?? '',
        note: event[`${m.key}_note`] ?? ''
      };
    }
    reset({
      name: event.name,
      status: event.status,
      event_date: event.event_date,
      location: event.location,
      schedule
    });
  }, [open, event, reset]);

  const onSubmit = async (values: EventEditValues) => {
    if (!event) return;
    const at = (key: MilestoneKey) => {
      const slot = values.schedule[key];
      return slot.time ? combineDateTime(slot.date || values.event_date, slot.time) : null;
    };
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        name: values.name.trim(),
        status: values.status,
        event_date: values.event_date,
        location: values.location.trim(),
        setup_start: at('setup_start'),
        venue_ready: at('venue_ready'),
        event_start: at('event_start'),
        event_finish: at('event_finish'),
        breakdown_start: at('breakdown_start'),
        breakdown_deadline: at('breakdown_deadline'),
        setup_start_note: values.schedule.setup_start.note.trim(),
        venue_ready_note: values.schedule.venue_ready.note.trim(),
        event_start_note: values.schedule.event_start.note.trim(),
        event_finish_note: values.schedule.event_finish.note.trim(),
        breakdown_start_note: values.schedule.breakdown_start.note.trim(),
        breakdown_deadline_note: values.schedule.breakdown_deadline.note.trim()
      });
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
      title={t('events.editEvent')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={updateEvent.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('events.eventName')}
            required
            error={formState.errors.name && t('validation.required')}
            {...register('name', { required: true })}
            className="sm:col-span-2"
          />
          <Select label={t('common.status')} {...register('status')}>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`eventStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Input label={t('events.eventDate')} type="date" {...register('event_date', { required: true })} />
          <Input label={t('common.location')} className="sm:col-span-2" {...register('location')} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('events.timeline')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MILESTONES.map((m) => (
              <div key={m.key} className="space-y-1.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t(m.label)}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    {...register(`schedule.${m.key}.date` as Path<EventEditValues>)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                    aria-label={`${t(m.label)} ${t('common.date')}`}
                  />
                  <input
                    type="time"
                    {...register(`schedule.${m.key}.time` as Path<EventEditValues>)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                    aria-label={`${t(m.label)} ${t('common.time')}`}
                  />
                </div>
                <input
                  type="text"
                  {...register(`schedule.${m.key}.note` as Path<EventEditValues>)}
                  placeholder={t('events.timingNote')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                  aria-label={`${t(m.label)} ${t('events.timingNote')}`}
                />
              </div>
            ))}
          </div>
        </div>

        {event && (
          <Link
            to={`/events/${event.id}/edit`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-navy-800 dark:text-gold-400 dark:hover:text-gold-300"
          >
            <ExternalLink className="h-4 w-4" /> {t('display.openFullEditor')}
          </Link>
        )}
      </form>
    </Modal>
  );
}
