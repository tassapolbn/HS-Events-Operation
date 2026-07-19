import { useState, type ReactNode } from 'react';
import { AlarmClock, CalendarDays, Check, ChevronDown, Clock, ListChecks, MapPin, User } from 'lucide-react';
import { useToggleDisplayTask } from '../../hooks/usePublicDisplay';
import { useLanguage } from '../../i18n';
import { RichTextViewer } from '../editor/RichTextViewer';
import { Spinner } from '../ui/Spinner';
import { AttachmentChips, EventBriefing, StatusBadge, boardStatus } from './EventBriefing';
import { categoryIcon, departmentIcon } from '../../lib/constants';
import { cn, darkenColor, extractDate, formatDate, formatTime, isRichTextEmpty, readableTextColor } from '../../lib/utils';
import type { DisplayDepartment, DisplayEvent, DisplaySession, DisplayTask } from '../../types';

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

  /**
   * Department panels. Tasks are deliberately lightweight: the date, time and
   * venue belong to the event, so they are stated once in the briefing above
   * and never repeated per task.
   */
  const renderPanels = (tasks: DisplayTask[]): ReactNode => {
    const visibleDepts = departments.filter(
      (dept) => (!selectedDept || dept.id === selectedDept) && tasks.some((task) => task.department_id === dept.id)
    );
    if (visibleDepts.length === 0) return null;
    const colClass =
      selectedDept || visibleDepts.length === 1
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
          const deptText = readableTextColor(dept.color);
          const allDone = done === deptTasks.length && deptTasks.length > 0;
          return (
            <div
              key={dept.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_6px_18px_-8px_rgba(15,23,42,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-600 dark:bg-slate-900"
            >
              <div
                className="flex items-center gap-2.5 px-4 py-3"
                style={{
                  background: `linear-gradient(120deg, ${dept.color} 0%, ${darkenColor(dept.color, 0.72)} 100%)`,
                  color: deptText
                }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${deptText}2b` }}>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="flex-1 truncate text-[0.95rem] font-extrabold" style={{ color: deptText }}>
                  {deptName(dept)}
                </h3>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-extrabold shadow-sm"
                  style={
                    allDone
                      ? { backgroundColor: '#10b981', color: '#ffffff' }
                      : { backgroundColor: `${deptText}2b`, color: deptText }
                  }
                >
                  {done}/{deptTasks.length}
                </span>
              </div>

              <ul className="flex-1 divide-y divide-slate-100 dark:divide-slate-800">
                {deptTasks.map((task, index) => {
                  const completed = task.status === 'completed';
                  const hasMeta = Boolean(task.assigned_staff) || task.attachments.length > 0 || completed;
                  return (
                    <li
                      key={task.id}
                      className={cn(
                        'px-4 py-2.5 transition-colors',
                        completed
                          ? 'border-l-[3px] border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/25'
                          : 'border-l-[3px] border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleTask.mutate({ taskId: task.id, done: !completed })}
                          className={cn(
                            // the after: ring expands the tap area to 44px for WCAG without shifting layout
                            "relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-150 after:absolute after:-inset-2 after:content-[''] hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-90",
                            completed
                              ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                              : 'border-slate-300 bg-white hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-900'
                          )}
                          title={t('display.tapToComplete')}
                          aria-label={t('display.tapToComplete')}
                          aria-pressed={completed}
                        >
                          {completed && <Check className="h-4 w-4" strokeWidth={3} />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'flex items-start gap-2 break-words text-[0.95rem] font-semibold leading-snug text-slate-800 dark:text-slate-100',
                              completed && 'text-slate-400 line-through dark:text-slate-500'
                            )}
                          >
                            <span className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[0.7rem] font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">{task.title}</span>
                          </p>

                          {!isRichTextEmpty(task.description) && !completed && (
                            <RichTextViewer html={task.description} className="mt-1 pl-7 text-sm text-slate-500 dark:text-slate-400" />
                          )}

                          {hasMeta && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-7">
                              {task.assigned_staff && !completed && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  <User className="h-3.5 w-3.5" /> {task.assigned_staff}
                                </span>
                              )}
                              {!completed && <AttachmentChips files={task.attachments} />}
                              {completed && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                                  <Check className="h-3 w-3" /> {t('display.completedLabel')}
                                </span>
                              )}
                            </div>
                          )}

                          {!isRichTextEmpty(task.notes) && !completed && (
                            <RichTextViewer html={task.notes} className="mt-1 pl-7 text-sm italic text-slate-400" />
                          )}
                        </div>
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

  /** A session states its own date, place and time once, above its panels. */
  const sessionHeader = (session: DisplaySession, tasks: DisplayTask[]): ReactNode => {
    const done = tasks.filter((task) => task.status === 'completed').length;
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-gradient-to-r from-navy-900 via-navy-800 to-navy-600 px-4 py-3.5 text-white shadow-md">
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

  // Timed work starting soon, across every event, so nothing is missed.
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
        const status = boardStatus(event, nowMs);
        const sessions = event.sessions ?? [];
        const sessionIds = new Set(sessions.map((s) => s.id));
        const generalTasks = event.tasks.filter((task) => !task.session_id || !sessionIds.has(task.session_id));

        return (
          <section
            key={event.id}
            id={`event-${event.id}`}
            className={cn(
              'animate-slide-up scroll-mt-4 overflow-hidden rounded-3xl border-2 bg-white transition-all duration-300 shadow-[0_12px_34px_-14px_var(--event-glow)] hover:shadow-[0_20px_48px_-14px_var(--event-glow)] dark:bg-slate-900',
              highlighted === event.id && 'ring-4 ring-gold-400/80'
            )}
            style={{ '--event-glow': `${headerColor}66`, borderColor: `${headerColor}80` } as React.CSSProperties}
          >
            <div className="h-2" style={{ backgroundColor: headerColor }} />

            {/* Event identity: name, live status and progress */}
            <header
              onClick={() => toggleCollapsed(event.id)}
              className="flex cursor-pointer select-none flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 lg:px-7"
              style={{
                background: `linear-gradient(120deg, ${headerColor} 0%, ${darkenColor(headerColor, 0.82)} 58%, ${darkenColor(headerColor, 0.6)} 100%)`,
                color: headerText
              }}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner" style={{ backgroundColor: `${headerText}26` }}>
                <CategoryIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-black tracking-tight 2xl:text-3xl" style={{ color: headerText }}>
                  {event.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold"
                    style={{ backgroundColor: `${headerText}26` }}
                  >
                    <CalendarDays className="h-4 w-4" /> {formatDate(event.event_date, lang, 'EEE d MMM yyyy')}
                  </span>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-black tabular-nums" style={{ color: headerText }}>
                    {doneTasks}/{totalTasks}
                  </span>
                  <span className="mt-1 block h-2 w-28 overflow-hidden rounded-full" style={{ backgroundColor: `${headerText}33` }}>
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

            {!isCollapsed && (
              <div className="px-5 pb-5 pt-4 lg:px-7">
                {/* Everything the whole event needs, stated once */}
                <EventBriefing event={event} />

                <div className="mt-5">
                  {sessions.length === 0 ? (
                    renderPanels(event.tasks)
                  ) : (
                    <div className="space-y-5">
                      {generalTasks.length > 0 && (
                        <div className="space-y-4 rounded-2xl border border-dashed border-slate-300 bg-slate-100/60 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                          <div className="flex items-center gap-2 px-1">
                            <ListChecks className="h-5 w-5 text-slate-400" />
                            <span className="text-lg font-extrabold tracking-tight text-slate-500 dark:text-slate-300">
                              {t('sessions.generalTasks')}
                            </span>
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
                            className="space-y-4 rounded-2xl border border-navy-100 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/40"
                          >
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
