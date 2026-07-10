import { useEffect } from 'react';
import { Controller, useForm, type Path } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useEvent, useEventMutations } from '../hooks/useEvents';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { RichTextEditor } from '../components/editor/RichTextEditor';
import { Spinner } from '../components/ui/Spinner';
import { EVENT_CATEGORIES, EVENT_STATUSES } from '../lib/constants';
import { combineDateTime, extractDate, extractTime } from '../lib/utils';
import type { EventStatus } from '../types';

const SCHEDULE_FIELDS = [
  { name: 'setup_start', label: 'events.setupStart' },
  { name: 'venue_ready', label: 'events.venueReady' },
  { name: 'event_start', label: 'events.eventStart' },
  { name: 'event_finish', label: 'events.eventFinish' },
  { name: 'breakdown_start', label: 'events.breakdownStart' },
  { name: 'breakdown_deadline', label: 'events.breakdownDeadline' }
] as const;

type ScheduleFieldName = (typeof SCHEDULE_FIELDS)[number]['name'];

interface ScheduleSlot {
  date: string;
  time: string;
}

interface EventFormValues {
  name: string;
  category: string;
  event_date: string;
  location: string;
  schedule: Record<ScheduleFieldName, ScheduleSlot>;
  description: string;
  additional_notes: string;
  internal_notes: string;
  status: EventStatus;
  header_color: string;
  header_text_color: string;
}

const emptySchedule = (): Record<ScheduleFieldName, ScheduleSlot> => ({
  setup_start: { date: '', time: '' },
  venue_ready: { date: '', time: '' },
  event_start: { date: '', time: '' },
  event_finish: { date: '', time: '' },
  breakdown_start: { date: '', time: '' },
  breakdown_deadline: { date: '', time: '' }
});

export function EventFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { data: existing, isLoading } = useEvent(id);
  const { createEvent, updateEvent } = useEventMutations();

  const { register, handleSubmit, control, reset, formState } = useForm<EventFormValues>({
    defaultValues: {
      name: '',
      category: 'general',
      event_date: '',
      location: '',
      schedule: emptySchedule(),
      description: '',
      additional_notes: '',
      internal_notes: '',
      status: 'draft',
      header_color: '#1a3c5e',
      header_text_color: '#FFFFFF'
    }
  });

  useEffect(() => {
    if (existing && isEdit) {
      const schedule = emptySchedule();
      for (const field of SCHEDULE_FIELDS) {
        const iso = existing[field.name];
        schedule[field.name] = {
          date: extractDate(iso) ?? '',
          time: extractTime(iso) ?? ''
        };
        // When the milestone falls on the event date itself, leave the
        // date box empty so the form stays clean and simple.
        if (schedule[field.name].date === existing.event_date) {
          schedule[field.name].date = '';
        }
      }
      reset({
        name: existing.name,
        category: existing.category,
        event_date: existing.event_date,
        location: existing.location,
        schedule,
        description: existing.description,
        additional_notes: existing.additional_notes,
        internal_notes: existing.internal_notes,
        status: existing.status,
        header_color: existing.header_color || '#1a3c5e',
        header_text_color: existing.header_text_color || '#FFFFFF'
      });
    }
  }, [existing, isEdit, reset]);

  const onSubmit = async (values: EventFormValues) => {
    const milestone = (name: ScheduleFieldName) => {
      const slot = values.schedule[name];
      if (!slot.time) return null;
      return combineDateTime(slot.date || values.event_date, slot.time);
    };
    const payload = {
      name: values.name.trim(),
      category: values.category,
      event_date: values.event_date,
      location: values.location.trim(),
      setup_start: milestone('setup_start'),
      venue_ready: milestone('venue_ready'),
      event_start: milestone('event_start'),
      event_finish: milestone('event_finish'),
      breakdown_start: milestone('breakdown_start'),
      breakdown_deadline: milestone('breakdown_deadline'),
      description: values.description,
      additional_notes: values.additional_notes,
      internal_notes: values.internal_notes,
      status: values.status,
      header_color: values.header_color,
      header_text_color: values.header_text_color
    };
    try {
      if (isEdit && id) {
        await updateEvent.mutateAsync({ id, ...payload });
        toast(t('common.savedSuccess'));
        navigate(`/events/${id}`);
      } else {
        const created = await createEvent.mutateAsync({ ...payload, created_by: profile?.id ?? null });
        toast(t('common.savedSuccess'));
        navigate(`/events/${created.id}`);
      }
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  if (isEdit && isLoading) return <Spinner />;

  const rteSection = (name: 'description' | 'additional_notes' | 'internal_notes', label: string, hint?: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </label>
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
          <RichTextEditor value={field.value} onChange={field.onChange} />
        </div>
      )}
    />
  );

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to={isEdit && id ? `/events/${id}` : '/events'}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> {t('common.back')}</Button>
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">
          {isEdit ? t('events.editEvent') : t('events.newEvent')}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>{t('events.basicInfo')}</CardTitle></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('events.eventName')}
              required
              error={formState.errors.name && t('validation.nameRequired')}
              {...register('name', { required: true })}
              className="sm:col-span-2"
            />
            <Select label={t('events.category')} {...register('category')}>
              {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
            </Select>
            <Input
              label={t('events.eventDate')}
              type="date"
              required
              error={formState.errors.event_date && t('validation.dateRequired')}
              {...register('event_date', { required: true })}
            />
            <Input label={t('events.eventLocation')} {...register('location')} className="sm:col-span-2" />
            <Select label={t('common.status')} {...register('status')}>
              {EVENT_STATUSES.map((s) => <option key={s} value={s}>{t(`eventStatus.${s}`)}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('events.headerColor')}
                </label>
                <input type="color" {...register('header_color')} className="h-10 w-full cursor-pointer rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('events.headerTextColor')}
                </label>
                <input type="color" {...register('header_text_color')} className="h-10 w-full cursor-pointer rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <p className="col-span-2 -mt-2 text-xs text-slate-400">{t('events.headerColorsHint')}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('events.schedule')}</CardTitle></CardHeader>
          <CardBody>
            <p className="mb-4 text-xs text-slate-400">{t('events.scheduleDateHint')}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SCHEDULE_FIELDS.map((field) => (
                <div key={field.name} className="space-y-1.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t(field.label)}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      {...register(`schedule.${field.name}.date` as Path<EventFormValues>)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                      aria-label={`${t(field.label)} ${t('common.date')}`}
                    />
                    <input
                      type="time"
                      {...register(`schedule.${field.name}.time` as Path<EventFormValues>)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                      aria-label={`${t(field.label)} ${t('events.times')}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('events.contentSection')}</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            {rteSection('description', t('events.descriptionLabel'))}
            {rteSection('additional_notes', t('events.additionalNotes'))}
            {rteSection('internal_notes', t('events.internalNotes'), t('events.internalOnly'))}
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3 pb-8">
          <Link to={isEdit && id ? `/events/${id}` : '/events'}>
            <Button variant="outline" type="button">{t('common.cancel')}</Button>
          </Link>
          <Button type="submit" loading={createEvent.isPending || updateEvent.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
