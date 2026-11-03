import { useEffect, useState } from 'react';
import { Controller, useForm, type Path } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEvent, useEventMutations, useEvents } from '../hooks/useEvents';
import { useDepartments } from '../hooks/useDepartments';
import { templateDataFromEvent, useTemplateMutations } from '../hooks/useTemplates';
import { useAuth } from '../contexts/AuthContext';
import { useCampus } from '../contexts/CampusContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { RichTextEditor } from '../components/editor/RichTextEditor';
import { Spinner } from '../components/ui/Spinner';
import { cleanContacts, EventContactsField } from '../components/events/EventContactsField';
import { CAMPUSES, CAMPUS_NAMES, EVENT_CATEGORIES, EVENT_STATUSES } from '../lib/constants';
import { combineDateTime, extractDate, extractTime, formatDate } from '../lib/utils';
import { sessionDaysForNewEvent, storedEndDate } from '../lib/eventDays';
import { supabase } from '../lib/supabase';
import type { Attachment, Campus, EventContact, EventStatus, EventWithTasks } from '../types';

function PastEventCard() {
  const { t, lang } = useLanguage();
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const events = useEvents({ includeArchived: true });
  const departments = useDepartments();
  const { createEventFromTemplate } = useTemplateMutations();
  const [sourceId, setSourceId] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [creating, setCreating] = useState(false);
  const text = (th: string, en: string) => lang === 'th' ? th : en;

  const createFromPast = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (!sourceId || !eventDate || !profile || !departments.data || creating) return;
    setCreating(true);
    try {
      const [sourceResult, attachmentResult] = await Promise.all([
        supabase.from('events').select('*, event_tasks(*), event_sessions(*)').eq('id', sourceId).is('deleted_at', null).single(),
        supabase.from('attachments').select('*').eq('entity_type', 'event').eq('entity_id', sourceId)
      ]);
      if (sourceResult.error) throw sourceResult.error;
      if (attachmentResult.error) throw attachmentResult.error;
      const source = sourceResult.data as EventWithTasks;
      source.event_tasks = (source.event_tasks ?? [])
        .filter((task) => !task.deleted_at)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
      source.event_sessions = (source.event_sessions ?? [])
        .sort((a, b) => a.session_date.localeCompare(b.session_date) || a.sort_order - b.sort_order);
      const checklistsByTask: Record<string, string[]> = {};
      if (source.event_tasks.length > 0) {
        const { data, error } = await supabase.from('task_checklist_items')
          .select('task_id, label, sort_order')
          .in('task_id', source.event_tasks.map((task) => task.id))
          .order('sort_order');
        if (error) throw error;
        for (const item of data ?? []) {
          (checklistsByTask[item.task_id] ??= []).push(item.label);
        }
      }
      const data = templateDataFromEvent(source, departments.data, (attachmentResult.data ?? []) as Attachment[], true, checklistsByTask);
      const eventId = await createEventFromTemplate.mutateAsync({
        template: {
          id: source.id, name: source.name, description: source.description, data,
          created_by: source.created_by, created_at: source.created_at, updated_at: source.updated_at
        },
        eventDate,
        departments: departments.data,
        userId: profile.id,
        overrides: {
          name: source.name, campus: source.campus,
          header_color: source.header_color, header_text_color: source.header_text_color,
          contacts: source.contacts ?? []
        }
      });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['display'] });
      toast(t('common.savedSuccess'));
      navigate(`/events/${eventId}`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>{text('เริ่มจากกิจกรรมที่ผ่านมา', 'Start from a past event')}</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={createFromPast} className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {text('คัดลอกช่วงกิจกรรมโดยเลื่อนเป็นวันที่ใหม่ พร้อมงาน รายการตรวจสอบ และไฟล์ กิจกรรมใหม่จะเป็นฉบับร่าง และงานจะเริ่มที่ยังไม่เริ่มทำ', 'Copies sessions to the new dates, along with jobs, checklists and files. The new event starts as a draft, with jobs not started.')}
          </p>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Select label={text('กิจกรรมต้นฉบับ', 'Source event')} required value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={creating || events.isLoading}>
              <option value="">{events.isLoading ? text('กำลังโหลด…', 'Loading…') : text('เลือกกิจกรรม', 'Choose an event')}</option>
              {(events.data ?? []).map((event) => <option key={event.id} value={event.id}>{formatDate(event.event_date, lang)} · {event.name} · {event.campus}</option>)}
            </Select>
            <Input label={text('วันเริ่มกิจกรรมใหม่', 'New start date')} type="date" required value={eventDate} onChange={(event) => setEventDate(event.target.value)} disabled={creating} />
          </div>
          {(events.isError || departments.isError) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('common.errorGeneric')}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={creating} disabled={!sourceId || !eventDate || !profile || !departments.data || events.isError || departments.isError}>
              {text('สร้างจากกิจกรรมนี้', 'Create from this event')}
            </Button>
            <Link to="/templates" className="rounded text-sm font-medium text-navy-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 dark:text-gold-300">{text('หรือใช้เทมเพลต', 'or use a template')}</Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

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
  /** Optional free text timing, e.g. "after school time" or "anytime that day" */
  note: string;
}

interface EventFormValues {
  name: string;
  category: string;
  campus: Campus;
  event_date: string;
  /** Last day of a multi-day event; empty for a one-day event */
  end_date: string;
  location: string;
  schedule: Record<ScheduleFieldName, ScheduleSlot>;
  description: string;
  additional_notes: string;
  internal_notes: string;
  status: EventStatus;
  header_color: string;
  header_text_color: string;
  contacts: EventContact[];
}

const emptySchedule = (): Record<ScheduleFieldName, ScheduleSlot> => ({
  setup_start: { date: '', time: '', note: '' },
  venue_ready: { date: '', time: '', note: '' },
  event_start: { date: '', time: '', note: '' },
  event_finish: { date: '', time: '', note: '' },
  breakdown_start: { date: '', time: '', note: '' },
  breakdown_deadline: { date: '', time: '', note: '' }
});

export function EventFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { campusFilter } = useCampus();
  const { data: existing, isLoading } = useEvent(id);
  const { createEvent, updateEvent } = useEventMutations();
  const queryClient = useQueryClient();

  const { register, handleSubmit, control, reset, formState, watch } = useForm<EventFormValues>({
    defaultValues: {
      name: '',
      category: 'general',
      campus: campusFilter ?? 'HSC',
      event_date: '',
      end_date: '',
      location: '',
      schedule: emptySchedule(),
      description: '',
      additional_notes: '',
      internal_notes: '',
      status: 'draft',
      header_color: '#1a3c5e',
      header_text_color: '#FFFFFF',
      contacts: []
    }
  });

  useEffect(() => {
    if (existing && isEdit) {
      const schedule = emptySchedule();
      for (const field of SCHEDULE_FIELDS) {
        const iso = existing[field.name];
        schedule[field.name] = {
          date: extractDate(iso) ?? '',
          time: extractTime(iso) ?? '',
          note: existing[`${field.name}_note`] ?? ''
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
        campus: existing.campus ?? 'HSC',
        event_date: existing.event_date,
        end_date: existing.end_date ?? '',
        location: existing.location,
        schedule,
        description: existing.description,
        additional_notes: existing.additional_notes,
        internal_notes: existing.internal_notes,
        status: existing.status,
        header_color: existing.header_color || '#1a3c5e',
        header_text_color: existing.header_text_color || '#FFFFFF',
        contacts: existing.contacts ?? []
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
      campus: values.campus,
      event_date: values.event_date,
      end_date: storedEndDate(values.event_date, values.end_date),
      location: values.location.trim(),
      setup_start: milestone('setup_start'),
      venue_ready: milestone('venue_ready'),
      event_start: milestone('event_start'),
      event_finish: milestone('event_finish'),
      breakdown_start: milestone('breakdown_start'),
      breakdown_deadline: milestone('breakdown_deadline'),
      setup_start_note: values.schedule.setup_start.note.trim(),
      venue_ready_note: values.schedule.venue_ready.note.trim(),
      event_start_note: values.schedule.event_start.note.trim(),
      event_finish_note: values.schedule.event_finish.note.trim(),
      breakdown_start_note: values.schedule.breakdown_start.note.trim(),
      breakdown_deadline_note: values.schedule.breakdown_deadline.note.trim(),
      description: values.description,
      additional_notes: values.additional_notes,
      internal_notes: values.internal_notes,
      status: values.status,
      header_color: values.header_color,
      header_text_color: values.header_text_color,
      // Rows nobody filled in are not people, so they never reach the database
      contacts: cleanContacts(values.contacts ?? [])
    };
    try {
      if (isEdit && id) {
        await updateEvent.mutateAsync({ id, ...payload });
        toast(t('common.savedSuccess'));
        navigate(`/events/${id}`);
      } else {
        const created = await createEvent.mutateAsync({ ...payload, created_by: profile?.id ?? null });
        // Every new event starts with a ready-to-use session for each of its
        // days (same place). The first day keeps the event's own times.
        const sessionDays = sessionDaysForNewEvent({ event_date: values.event_date, end_date: payload.end_date });
        try {
          await supabase.from('event_sessions').insert(
            sessionDays.map((day, index) => ({
              event_id: created.id,
              session_date: day,
              location: values.location.trim(),
              start_time: index === 0 ? milestone('event_start') : null,
              end_time: index === 0 ? milestone('event_finish') : null,
              sort_order: 0
            }))
          );
        } catch {
          /* non-critical */
        }
        // The new days' sessions belong on the calendar, the alert bar and the board too
        queryClient.invalidateQueries({ queryKey: ['calendar'] });
        queryClient.invalidateQueries({ queryKey: ['display'] });
        toast(t('common.savedSuccess'));
        navigate(`/events/${created.id}`);
      }
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const startDate = watch('event_date');

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

      {!isEdit && <PastEventCard />}

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
            <Select label={t('campus.label')} {...register('campus')}>
              {CAMPUSES.map((c) => <option key={c} value={c}>{c} - {CAMPUS_NAMES[c]}</option>)}
            </Select>
            <Input
              label={t('events.startDate')}
              type="date"
              required
              error={formState.errors.event_date && t('validation.dateRequired')}
              {...register('event_date', { required: true })}
            />
            {/* Several days: the event shows on every one of them in the calendar */}
            <Input
              label={t('events.endDate')}
              type="date"
              min={startDate || undefined}
              hint={t('events.endDateHint')}
              error={formState.errors.end_date && t('events.endBeforeStart')}
              {...register('end_date', {
                validate: (value, form) => !value || !form.event_date || value >= form.event_date
              })}
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
                  {/* Free text timing for anything a clock cannot express */}
                  <input
                    type="text"
                    {...register(`schedule.${field.name}.note` as Path<EventFormValues>)}
                    placeholder={t('events.timingNote')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                    aria-label={`${t(field.label)} ${t('events.timingNote')}`}
                  />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Who a department asks when something about this event is unclear */}
        <Card>
          <CardHeader><CardTitle>{t('events.contacts')}</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('events.contactsHint')}</p>
            <Controller
              control={control}
              name="contacts"
              render={({ field }) => (
                <EventContactsField value={field.value ?? []} onChange={field.onChange} />
              )}
            />
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
