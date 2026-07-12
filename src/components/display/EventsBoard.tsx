import { useState, type ReactNode } from 'react';
import {
  AlarmClock, CalendarDays, Check, ChevronDown, Clock, DoorOpen, Flag, Hammer, ListChecks,
  Map as MapIcon, MapPin, PackageCheck, PackageOpen, Paperclip, PlayCircle, StickyNote, User
} from 'lucide-react';
import { useToggleDisplayTask } from '../../hooks/usePublicDisplay';
import { getSignedUrl } from '../../hooks/useAttachments';
import { useLanguage } from '../../i18n';
import { RichTextViewer } from '../editor/RichTextViewer';
import { Spinner } from '../ui/Spinner';
import { categoryIcon, departmentIcon } from '../../lib/constants';
import { cn, darkenColor, extractDate, formatDate, formatTime, isRichTextEmpty } from '../../lib/utils';
import type { DisplayAttachment, DisplayDepartment, DisplayEvent, DisplaySession, DisplayTask } from '../../types';

function AttachmentChips({ files }: { files: DisplayAttachment[] }) {
  const open = async (file: DisplayAttachment) => {
    try {
      const url = await getSignedUrl(file.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch {
      /* read-only board */
    }
  };
  if (files.length === 0) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <button
          key={file.id}
          onClick={(e) => {
            e.stopPropagation();
            open(file);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <Paperclip className="h-3 w-3" /> {file.file_name}
        </button>
      ))}
    </span>
  );
}

interface EventsBoardProps {
  events: DisplayEvent[] | undefined;
  departments: DisplayDepartment[];
  selectedDept: string;
  isLoading: boolean;
}

export function EventsBoard({ events, departments, selectedDept, isLoading }: EventsBoardProps) {
  const { t, deptName, lang } = useLanguage();
  const toggleTask = useToggleDisplayTask();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState<string | null>(null);

  /** Jump from an upcoming task card to its event: expand, scroll, flash */
  const goToEvent = (eventId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    setHighlighted(eventId);
    window.setTimeout(() => {
      document.getElementById(`event-${eventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    window.setTimeout(() => setHighlighted(null), 2600);
  };

  const toggleCollapsed = (eventId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  if (isLoading) return <Spinner />;
  if (!events || events.length === 0) {
    return <p className="py-24 text-center text-xl text-slate-400">{t('display.noEvents')}</p>;
  }

  const milestonePills = (event: DisplayEvent): ReactNode => {
    const items = [
      { label: t('timeline.setupBegins'), value: event.setup_start, key: true, icon: Hammer },
      { label: t('timeline.venueReady'), value: event.venue_ready, key: true, icon: DoorOpen },
      { label: t('timeline.eventStarts'), value: event.event_start, key: false, icon: PlayCircle },
      { label: t('timeline.eventEnds'), value: event.event_finish, key: false, icon: Flag },
      { label: t('timeline.breakdownBegins'), value: event.breakdown_start, key: false, icon: PackageOpen },
      { label: t('timeline.breakdownComplete'), value: event.breakdown_deadline, key: false, icon: PackageCheck }
    ].filter((m) => m.value);
    if (items.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((m) => {
          const sameDay = extractDate(m.value) === event.event_date;
          const Icon = m.icon;
          return (
            <span
              key={m.label}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 transition-transform hover:scale-[1.03]',
                m.key
                  ? 'border-gold-300 bg-gold-50 dark:border-gold-800 dark:bg-gold-950/40'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5 shrink-0', m.key ? 'text-gold-600 dark:text-gold-400' : 'text-slate-400')} />
              <span className={cn('text-xs font-semibold', m.key ? 'text-gold-700 dark:text-gold-400' : 'text-slate-400')}>
                {m.label}
              </span>
              <span className={cn('text-sm font-extrabold tabular-nums', m.key ? 'text-gold-800 dark:text-gold-300' : 'text-slate-700 dark:text-slate-200')}>
                {sameDay ? '' : `${formatDate(m.value, lang, 'd MMM')} `}{formatTime(m.value, lang)}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  const renderPanels = (tasks: DisplayTask[]): ReactNode => {
    const visibleDepts = departments.filter(
      (dept) => (!selectedDept || dept.id === selectedDept) && tasks.some((task) => task.department_id === dept.id)
    );
    if (visibleDepts.length === 0) return null;
    // Cap the column count at the number of departments so we never leave
    // empty columns (a common source of blank white space on wide screens).
    const colClass = selectedDept || visibleDepts.length === 1
      ? 'grid-cols-1'
      : visibleDepts.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : visibleDepts.length === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    return (
      <div className={cn('grid items-start gap-4', colClass)}>
        {visibleDepts.map((dept) => {
          const Icon = departmentIcon(dept.icon);
          const deptTasks = tasks.filter((task) => task.department_id === dept.id);
          const done = deptTasks.filter((task) => task.status === 'completed').length;
          return (
            <div
              key={dept.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_6px_18px_-8px_rgba(15,23,42,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-600 dark:bg-slate-900"
            >
              <div className="h-1.5" style={{ backgroundColor: dept.color }} />
              <div
                className="flex items-center gap-2.5 border-b px-4 py-3.5"
                style={{ backgroundColor: `${dept.color}0d`, borderBottomColor: `${dept.color}30` }}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${dept.color}1f`, color: dept.color }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="flex-1 truncate text-[0.95rem] font-extrabold text-slate-800 dark:text-slate-100">{deptName(dept)}</h3>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-extrabold text-white shadow-sm"
                  style={{ backgroundColor: done === deptTasks.length && deptTasks.length > 0 ? '#10b981' : dept.color }}
                >
                  {done}/{deptTasks.length}
                </span>
              </div>
              <ul className="flex-1 divide-y divide-slate-100 dark:divide-slate-800">
                {deptTasks.map((task, index) => {
                  const completed = task.status === 'completed';
                  return (
                    <li
                      key={task.id}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3.5 transition-colors',
                        completed
                          ? 'border-l-[3px] border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/25'
                          : 'border-l-[3px] border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      <button
                        onClick={() => toggleTask.mutate({ taskId: task.id, done: !completed })}
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-150 hover:scale-110 active:scale-90',
                          completed
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                            : 'border-slate-300 bg-white hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-900'
                        )}
                        title={t('display.tapToComplete')}
                        aria-label={t('display.tapToComplete')}
                      >
                        {completed && <Check className="h-4 w-4" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'break-words text-[0.95rem] font-semibold leading-relaxed text-slate-800 dark:text-slate-100',
                            completed && 'text-slate-400 line-through dark:text-slate-500'
                          )}
                        >
                          <span className="mr-1.5 text-sm font-bold text-slate-300 dark:text-slate-600">{index + 1}.</span>
                          {task.title}
                        </p>
                        {!isRichTextEmpty(task.description) && !completed && (
                          <RichTextViewer html={task.description} className="mt-1 text-sm text-slate-500" />
                        )}
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                          {(task.work_location || task.setup_location) && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" /> {task.work_location || task.setup_location}
                            </span>
                          )}
                          {task.start_time && (
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-300">
                              <Clock className="h-3.5 w-3.5" /> {formatTime(task.start_time, lang)}
                              {task.completion_time && <> - {formatTime(task.completion_time, lang)}</>}
                            </span>
                          )}
                          {task.assigned_staff && (
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3.5 w-3.5" /> {task.assigned_staff}
                            </span>
                          )}
                        </p>
                        {!isRichTextEmpty(task.notes) && (
                          <RichTextViewer html={task.notes} className="mt-1 text-sm italic text-slate-400" />
                        )}
                        <AttachmentChips files={task.attachments} />
                        {completed && (
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                            <Check className="h-3 w-3" /> {t('display.completedLabel')}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };

  const sessionHeader = (session: DisplaySession, tasks: DisplayTask[]): ReactNode => {
    const done = tasks.filter((task) => task.status === 'completed').length;
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-gradient-to-r from-navy-900 via-navy-800 to-navy-600 px-4 py-3.5 text-white shadow-md">
        {/* Calendar-icon tile that still shows the session date */}
        <span className="flex h-12 w-12 shrink-0 flex-col overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/10">
          <span className="flex h-[1.1rem] items-center justify-center bg-gold-400 text-[0.55rem] font-extrabold uppercase tracking-wide text-navy-900">
            {formatDate(session.session_date, lang, 'MMM')}
          </span>
          <span className="flex flex-1 items-center justify-center text-xl font-extrabold leading-none text-navy-900">
            {formatDate(session.session_date, lang, 'd')}
          </span>
        </span>
        <div className="min-w-0">
          <p className="text-lg font-extrabold tracking-tight">
            {session.title || formatDate(session.session_date, lang, 'EEEE d MMMM')}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-sm font-bold">
              <CalendarDays className="h-4 w-4 text-gold-400" /> {formatDate(session.session_date, lang)}
            </span>
            {session.location && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-sm font-bold">
                <MapPin className="h-4 w-4 text-gold-400" /> {session.location}
              </span>
            )}
            {session.start_time && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-sm font-bold tabular-nums">
                <Clock className="h-4 w-4 text-gold-400" /> {formatTime(session.start_time, lang)}
                {session.end_time && <> - {formatTime(session.end_time, lang)}</>}
              </span>
            )}
          </p>
        </div>
        <span
          className={cn(
            'ml-auto rounded-full px-3 py-1 text-sm font-extrabold shadow-sm',
            done === tasks.length && tasks.length > 0 ? 'bg-emerald-500 text-white' : 'bg-gold-400 text-navy-900'
          )}
        >
          {done}/{tasks.length}
        </span>
      </div>
    );
  };

  // Upcoming tasks across ALL events, sorted by start time, so staff never
  // miss work from another event happening the same day.
  const nowMs = Date.now();
  const horizonMs = nowMs + 48 * 3600 * 1000;
  const upcoming = events
    .flatMap((ev) =>
      ev.tasks
        .filter((task) => task.start_time && task.status !== 'completed' && task.status !== 'cancelled')
        .filter((task) => {
          const ts = new Date(task.start_time as string).getTime();
          return ts >= nowMs - 30 * 60000 && ts <= horizonMs;
        })
        .filter((task) => !selectedDept || task.department_id === selectedDept)
        .map((task) => ({ task, event: ev }))
    )
    .sort((a, b) => (a.task.start_time as string).localeCompare(b.task.start_time as string))
    .slice(0, 10);

  const relativeLabel = (iso: string): string | null => {
    const mins = Math.round((new Date(iso).getTime() - nowMs) / 60000);
    if (mins < -5) return null;
    if (mins <= 60) return lang === 'th' ? `อีก ${Math.max(mins, 0)} นาที` : `in ${Math.max(mins, 0)} min`;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Upcoming tasks rail */}
      {upcoming.length > 0 && (
        <section className="animate-slide-up rounded-3xl border border-gold-200 bg-gradient-to-r from-gold-50 via-white to-white p-4 shadow-sm dark:border-gold-900 dark:from-gold-950/30 dark:via-slate-900 dark:to-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold-400 text-navy-900">
              <AlarmClock className="h-4 w-4" />
            </span>
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">{t('display.upNext')}</h2>
            <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-bold text-gold-700 dark:bg-gold-900/60 dark:text-gold-300">
              {upcoming.length}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcoming.map(({ task, event }) => {
              const dept = departments.find((d) => d.id === task.department_id);
              const DeptIcon = departmentIcon(dept?.icon ?? 'users');
              const sameDay = extractDate(task.start_time) === formatDate(new Date(), 'en', 'yyyy-MM-dd');
              const soon = relativeLabel(task.start_time as string);
              return (
                <div
                  key={task.id}
                  onClick={() => goToEvent(event.id)}
                  title={t('display.tapToView')}
                  className={cn(
                    'flex w-64 shrink-0 cursor-pointer flex-col gap-1.5 rounded-2xl border bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900',
                    soon ? 'border-gold-300 ring-1 ring-gold-300/60 dark:border-gold-700' : 'border-slate-200 dark:border-slate-700'
                  )}
                  style={{ borderLeft: `5px solid ${event.header_color || '#1a3c5e'}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold tabular-nums tracking-tight text-navy-800 dark:text-gold-300">
                      {sameDay ? '' : `${formatDate(task.start_time, lang, 'd MMM')} `}
                      {formatTime(task.start_time, lang)}
                    </span>
                    {soon && (
                      <span className="animate-pulse rounded-full bg-gold-400 px-2 py-0.5 text-[0.65rem] font-extrabold text-navy-900">
                        {soon}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTask.mutate({ taskId: task.id, done: true });
                      }}
                      title={t('display.tapToComplete')}
                      className="group ml-auto flex h-6 w-6 items-center justify-center rounded-lg border-2 border-slate-300 bg-white transition-all hover:scale-110 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800"
                    >
                      <Check className="h-3.5 w-3.5 text-transparent transition-colors group-hover:text-emerald-500" />
                    </button>
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">{task.title}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="inline-flex max-w-full items-center gap-1.5 truncate font-bold" style={{ color: event.header_color || '#1a3c5e' }}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.header_color || '#1a3c5e' }} />
                      <span className="truncate">{event.name}</span>
                    </span>
                    {dept && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                        style={{ backgroundColor: `${dept.color}1a`, color: dept.color }}
                      >
                        <DeptIcon className="h-3 w-3" /> {deptName(dept)}
                      </span>
                    )}
                    {(task.work_location || task.setup_location) && (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <MapPin className="h-3 w-3" /> {task.work_location || task.setup_location}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {events.map((event) => {
        const isCollapsed = collapsed.has(event.id);
        const anyVisibleTask = event.tasks.some((task) => !selectedDept || task.department_id === selectedDept);
        if (selectedDept && !anyVisibleTask) return null;
        const totalTasks = event.tasks.length;
        const doneTasks = event.tasks.filter((task) => task.status === 'completed').length;
        const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
        const headerColor = event.header_color || '#1a3c5e';
        const headerText = event.header_text_color || '#ffffff';
        const CategoryIcon = categoryIcon(event.category);
        const hasMilestones = [
          event.setup_start, event.venue_ready, event.event_start,
          event.event_finish, event.breakdown_start, event.breakdown_deadline
        ].some(Boolean);
        const hasMeta = hasMilestones || !isRichTextEmpty(event.description) ||
          !isRichTextEmpty(event.additional_notes) || event.attachments.length > 0;
        const sessions = event.sessions ?? [];
        const sessionIds = new Set(sessions.map((s) => s.id));
        const generalTasks = event.tasks.filter((task) => !task.session_id || !sessionIds.has(task.session_id));
        return (
          <section
            key={event.id}
            id={`event-${event.id}`}
            className={cn(
              'animate-slide-up scroll-mt-4 overflow-hidden rounded-3xl border-2 bg-white transition-all duration-300 shadow-[0_12px_34px_-14px_var(--event-glow)] hover:-translate-y-0.5 hover:shadow-[0_20px_48px_-14px_var(--event-glow)] dark:bg-slate-900',
              highlighted === event.id && 'ring-4 ring-gold-400/80'
            )}
            style={{
              '--event-glow': `${headerColor}66`,
              borderColor: `${headerColor}80`
            } as React.CSSProperties}
          >
            <div className="h-2" style={{ backgroundColor: headerColor }} />
            {/* Event header band: bold and colored so the event name stands out */}
            <header
              onClick={() => toggleCollapsed(event.id)}
              className="flex cursor-pointer select-none flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 lg:px-7"
              style={{
                background: `linear-gradient(120deg, ${headerColor} 0%, ${darkenColor(headerColor, 0.82)} 58%, ${darkenColor(headerColor, 0.6)} 100%)`,
                color: headerText
              }}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner"
                style={{ backgroundColor: `${headerText}26` }}
              >
                <CategoryIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-black tracking-tight 2xl:text-3xl" style={{ color: headerText }}>
                  {event.name}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold"
                    style={{ backgroundColor: `${headerText}26` }}
                  >
                    <CalendarDays className="h-4 w-4" /> {formatDate(event.event_date, lang, 'EEE d MMM yyyy')}
                  </span>
                  {event.location && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold"
                      style={{ backgroundColor: `${headerText}26` }}
                    >
                      <MapPin className="h-4 w-4" /> {event.location}
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-black tabular-nums" style={{ color: headerText }}>
                    {doneTasks}/{totalTasks}
                  </span>
                  <span
                    className="mt-1 block h-2 w-28 overflow-hidden rounded-full"
                    style={{ backgroundColor: `${headerText}33` }}
                  >
                    <span
                      className="block h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#34d399' : headerText }}
                    />
                  </span>
                </span>
                <ChevronDown
                  className={cn('h-6 w-6 transition-transform duration-300', isCollapsed && '-rotate-90')}
                  style={{ color: `${headerText}cc` }}
                />
              </div>
            </header>

            {/* Body: event details + department work */}
            {!isCollapsed && (
              <div className={cn('px-5 pb-5 lg:px-7', hasMeta ? 'pt-4' : 'pt-0')}>
                {milestonePills(event)}
                {!isRichTextEmpty(event.description) && (
                  <RichTextViewer html={event.description} className="mt-4 max-w-4xl text-slate-600 dark:text-slate-300" />
                )}
                {!isRichTextEmpty(event.additional_notes) && (
                  <div className="mt-4 flex max-w-4xl items-start gap-2.5 rounded-r-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-500 dark:bg-amber-950/30">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <RichTextViewer html={event.additional_notes} className="!text-amber-900 dark:!text-amber-200" />
                  </div>
                )}
                {event.attachments.length > 0 && (
                  <div className={cn(
                    'rounded-xl border border-gold-300 bg-gold-50 px-3.5 py-2.5 dark:border-gold-800 dark:bg-gold-950/30',
                    (hasMilestones || !isRichTextEmpty(event.description) || !isRichTextEmpty(event.additional_notes)) && 'mt-4'
                  )}>
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gold-700 dark:text-gold-300">
                      <MapIcon className="h-4 w-4" /> {t('display.reference')}
                    </span>
                    <AttachmentChips files={event.attachments} />
                  </div>
                )}
                <div className={cn(hasMeta && 'mt-5')}>
                  {sessions.length === 0 ? (
                    renderPanels(event.tasks)
                  ) : (
                    <div className="relative space-y-5 pl-5">
                    <span className="absolute bottom-2 left-[7px] top-2 w-0.5 rounded-full bg-gradient-to-b from-gold-400 via-slate-200 to-slate-200 dark:via-slate-700 dark:to-slate-700" />
                    {generalTasks.length > 0 && (
                      <div className="relative space-y-4 rounded-2xl border border-dashed border-slate-300 bg-slate-100/60 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                        <span className="absolute -left-[29px] top-6 h-3 w-3 rounded-full border-2 border-white bg-slate-300 dark:border-slate-900 dark:bg-slate-600" />
                        <div className="flex items-center gap-2 px-1">
                          <ListChecks className="h-5 w-5 text-slate-400" />
                          <span className="text-lg font-extrabold tracking-tight text-slate-500 dark:text-slate-300">{t('sessions.generalTasks')}</span>
                        </div>
                        {renderPanels(generalTasks)}
                      </div>
                    )}
                    {sessions.map((session) => {
                      const sessionTasks = event.tasks.filter((task) => task.session_id === session.id);
                      if (sessionTasks.length === 0) return null;
                      const panels = renderPanels(sessionTasks);
                      if (!panels) return null;
                      return (
                        <div
                          key={session.id}
                          className="relative space-y-4 rounded-2xl border border-navy-100 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/40"
                        >
                          <span className="absolute -left-[29px] top-7 h-3 w-3 rounded-full border-2 border-white bg-gold-400 dark:border-slate-900" />
                          {sessionHeader(session, sessionTasks)}
                          {panels}
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
