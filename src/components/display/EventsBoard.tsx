import { useState, type ReactNode } from 'react';
import {
  CalendarDays, Check, ChevronDown, Clock, MapPin, Paperclip, StickyNote, User
} from 'lucide-react';
import { useToggleDisplayTask } from '../../hooks/usePublicDisplay';
import { getSignedUrl } from '../../hooks/useAttachments';
import { useLanguage } from '../../i18n';
import { RichTextViewer } from '../editor/RichTextViewer';
import { Spinner } from '../ui/Spinner';
import { departmentIcon } from '../../lib/constants';
import { cn, extractDate, formatDate, formatTime, isRichTextEmpty } from '../../lib/utils';
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
      { label: t('timeline.setupBegins'), value: event.setup_start, key: true },
      { label: t('timeline.venueReady'), value: event.venue_ready, key: true },
      { label: t('timeline.eventStarts'), value: event.event_start, key: false },
      { label: t('timeline.eventEnds'), value: event.event_finish, key: false },
      { label: t('timeline.breakdownBegins'), value: event.breakdown_start, key: false },
      { label: t('timeline.breakdownComplete'), value: event.breakdown_deadline, key: false }
    ].filter((m) => m.value);
    if (items.length === 0) return null;
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((m) => {
          const sameDay = extractDate(m.value) === event.event_date;
          return (
            <span
              key={m.label}
              className={cn(
                'inline-flex items-baseline gap-1.5 rounded-xl border px-3 py-1.5 transition-transform hover:scale-[1.03]',
                m.key
                  ? 'border-gold-300 bg-gold-50 dark:border-gold-800 dark:bg-gold-950/40'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
              )}
            >
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
    return (
      <div className={cn('grid gap-4', selectedDept ? 'grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4')}>
        {visibleDepts.map((dept) => {
          const Icon = departmentIcon(dept.icon);
          const deptTasks = tasks.filter((task) => task.department_id === dept.id);
          const done = deptTasks.filter((task) => task.status === 'completed').length;
          return (
            <div
              key={dept.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="h-1" style={{ backgroundColor: dept.color }} />
              <div className="flex items-center gap-2.5 px-4 py-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${dept.color}1a`, color: dept.color }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{deptName(dept)}</h3>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{ backgroundColor: `${dept.color}1a`, color: dept.color }}
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
                        'flex items-start gap-3 px-4 py-3 transition-colors',
                        completed ? 'bg-emerald-50/70 dark:bg-emerald-950/25' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
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
                            'text-[0.95rem] font-semibold leading-snug text-slate-800 dark:text-slate-100',
                            completed && 'text-slate-400 line-through dark:text-slate-500'
                          )}
                        >
                          <span className="mr-1.5 font-bold text-slate-300 dark:text-slate-600">{index + 1}.</span>
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

  const sessionHeader = (session: DisplaySession): ReactNode => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Calendar tile */}
      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900">
        <span className="text-lg font-extrabold leading-none">{formatDate(session.session_date, lang, 'd')}</span>
        <span className="text-[0.6rem] font-bold uppercase leading-tight opacity-80">
          {formatDate(session.session_date, lang, 'MMM')}
        </span>
      </span>
      <div className="min-w-0">
        <p className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
          {session.title || formatDate(session.session_date, lang, 'EEEE d MMMM')}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5 text-gold-500" /> {formatDate(session.session_date, lang)}
          </span>
          {session.location && (
            <span className="inline-flex items-center gap-1 text-sm font-bold text-navy-700 dark:text-gold-300">
              <MapPin className="h-4 w-4" /> {session.location}
            </span>
          )}
          {session.start_time && (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Clock className="h-3.5 w-3.5 text-gold-500" /> {formatTime(session.start_time, lang)}
              {session.end_time && <> - {formatTime(session.end_time, lang)}</>}
            </span>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {events.map((event) => {
        const isCollapsed = collapsed.has(event.id);
        const anyVisibleTask = event.tasks.some((task) => !selectedDept || task.department_id === selectedDept);
        if (selectedDept && !anyVisibleTask) return null;
        const totalTasks = event.tasks.length;
        const doneTasks = event.tasks.filter((task) => task.status === 'completed').length;
        const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
        const sessions = event.sessions ?? [];
        const sessionIds = new Set(sessions.map((s) => s.id));
        const generalTasks = event.tasks.filter((task) => !task.session_id || !sessionIds.has(task.session_id));
        return (
          <section
            key={event.id}
            className="animate-slide-up overflow-hidden rounded-3xl border bg-white transition-all duration-300 shadow-[0_10px_30px_-12px_var(--event-glow)] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-12px_var(--event-glow)] dark:bg-slate-900"
            style={{
              '--event-glow': `${event.header_color || '#1a3c5e'}59`,
              borderColor: `${event.header_color || '#1a3c5e'}40`
            } as React.CSSProperties}
          >
            {/* Event header: light, title-first */}
            <header
              onClick={() => toggleCollapsed(event.id)}
              className="cursor-pointer select-none px-6 py-5"
              style={{ borderLeft: `6px solid ${event.header_color || '#1a3c5e'}` }}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.header_color || '#1a3c5e' }} />
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white 2xl:text-3xl">
                  {event.name}
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <CalendarDays className="h-4 w-4" /> {formatDate(event.event_date, lang, 'EEE d MMM yyyy')}
                </span>
                {event.location && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <MapPin className="h-4 w-4" /> {event.location}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3">
                  <span className="hidden w-28 sm:block">
                    <span className="mb-1 block text-right text-xs font-bold text-slate-400">
                      {doneTasks}/{totalTasks}
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                    </span>
                  </span>
                  <ChevronDown className={cn('h-6 w-6 text-slate-300 transition-transform duration-300', isCollapsed && '-rotate-90')} />
                </span>
              </div>

              {!isCollapsed && (
                <>
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
                  <AttachmentChips files={event.attachments} />
                </>
              )}
            </header>

            {/* Sessions timeline */}
            {!isCollapsed && (
              <div className="border-t border-slate-100 px-6 py-5 dark:border-slate-800">
                {sessions.length === 0 ? (
                  renderPanels(event.tasks)
                ) : (
                  <div className="relative space-y-6 pl-5">
                    <span className="absolute bottom-2 left-[7px] top-2 w-0.5 rounded-full bg-gradient-to-b from-gold-400 via-slate-200 to-slate-200 dark:via-slate-700 dark:to-slate-700" />
                    {generalTasks.length > 0 && (
                      <div className="relative space-y-3">
                        <span className="absolute -left-5 top-4 h-3 w-3 rounded-full border-2 border-white bg-slate-300 dark:border-slate-900 dark:bg-slate-600" />
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                          <span className="text-sm font-bold text-slate-500 dark:text-slate-300">{t('sessions.generalTasks')}</span>
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
                        <div key={session.id} className="relative space-y-3">
                          <span className="absolute -left-5 top-5 h-3 w-3 rounded-full border-2 border-white bg-gold-400 dark:border-slate-900" />
                          {sessionHeader(session)}
                          {panels}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
