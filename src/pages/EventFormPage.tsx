import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { combineDateTime, extractTime } from '../lib/utils';
import type { EventStatus } from '../types';

interface EventFormValues {
  name: string;
  category: string;
  event_date: string;
  location: string;
  setup_start: string;
  venue_ready: string;
  event_start: string;
  event_finish: string;
  breakdown_start: string;
  breakdown_deadline: string;
  description: string;
  additional_notes: string;
  internal_notes: string;
  status: EventStatus;
  header_color: string;
  header_text_color: string;
}

const TIME_FIELDS = [
  { name: 'setup_start', label: 'events.setupStart' },
  { name: 'venue_ready', label: 'events.venueReady' },
  { name: 'event_start', label: 'events.eventStart' },
  { name: 'event_finish', label: 'events.eventFinish' },
  { name: 'breakdown_start', label: 'events.breakdownStart' },
  { name: 'breakdown_deadline', label: 'events.breakdownDeadline' }
] as const;

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
      setup_start: '',
      venue_ready: '',
      event_start: '',
      event_finish: '',
      breakdown_start: '',
      breakdown_deadline: '',
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
      reset({
        name: existing.name,
        category: existing.category,
        event_date: existing.event_date,
        location: existing.location,
        setup_start: extractTime(existing.setup_start) ?? '',
        venue_ready: extractTime(existing.venue_ready) ?? '',
        event_start: extractTime(existing.event_start) ?? '',
        event_finish: extractTime(existing.event_finish) ?? '',
        breakdown_start: extractTime(existing.breakdown_start) ?? '',
        breakdown_deadline: extractTime(existing.breakdown_deadline) ?? '',
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
    const payload = {
      name: values.name.trim(),
      category: values.category,
      event_date: values.event_date,
      location: values.location.trim(),
      setup_start: combineDateTime(values.event_date, values.setup_start || null),
      venue_ready: combineDateTime(values.event_date, values.venue_ready || null),
      event_start: combineDateTime(values.event_date, values.event_start || null),
      event_finish: combineDateTime(values.event_date, values.event_finish || null),
      breakdown_start: combineDateTime(values.event_date, values.breakdown_start || null),
      breakdown_deadline: combineDateTime(values.event_date, values.breakdown_deadline || null),
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
    <div className="animate-fade-in mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link to={isEdit && id ? `/events/${id}` : '/events'}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> {t('common.back')}</Button>
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">
          {isEdit ? t('events.editEvent') : t('events.newEvent')}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
          <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {TIME_FIELDS.map((field) => (
              <Input key={field.name} label={t(field.label)} type="time" {...register(field.name)} />
            ))}
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
