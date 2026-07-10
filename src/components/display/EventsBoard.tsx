import { useState, type ReactNode } from 'react';
import { CalendarDays, Check, ChevronDown, Clock, Layers, MapPin, Paperclip, User } from 'lucide-react';
import { useToggleDisplayTask } from '../../hooks/usePublicDisplay';
import { getSignedUrl } from '../../hooks/useAttachments';
import { useLanguage } from '../../i18n';
import { RichTextViewer } from '../editor/RichTextViewer';
import { Spinner } from '../ui/Spinner';
import { departmentIcon } from '../../lib/constants';
import { cn, darkenColor, extractDate, formatDate, formatTime, isRichTextEmpty } from '../../lib/utils';
import type { DisplayAttachment, DisplayDepartment, DisplayEvent, DisplayTask } from '../../types';

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
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <button
          key={file.id}
          onClick={(e) => {
            e.stopPropagation();
            open(file);
          }}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition-transform hover:scale-105 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
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

  const milestones = (event: DisplayEvent) =>
    [
      { label: t('timeline.setupBegins'), value: event.setup_start },
      { label: t('timeline.venueReady'), value: event.venue_ready },
      { label: t('timeline.eventStarts'), value: event.event_start },
      { label: t('timeline.eventEnds'), value: event.event_finish },
      { label: t('timeline.breakdownBegins'), value: event.breakdown_start },
      { label: t('timeline.breakdownComplete'), value: event.breakdown_deadline }
    ].filter((m) => m.value);

  const renderPanels = (tasks: DisplayTask[]): ReactNode => {
    const visibleDepts = departments.filter(
      (dept) => (!selectedDept || dept.id === selectedDept) && tasks.some((task) => task.department_id === dept.id)
    );
    if (visibleDepts.length === 0) return null;
    return (
      <div className={cn('grid gap-3 2xl:gap-4', selectedDept ? 'grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4')}>
        {visibleDepts.map((dept) => {
          const Icon = departmentIcon(dept.icon);
          const deptTasks = tasks.filter((task) => task.department_id === dept.id);
          const done = deptTasks.filter((task) => task.status === 'completed').length;
          return (
            <div
              key={dept.id}
              className="flex flex-col overflow-hidden rounded-2xl border-2 bg-slate-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-800/50"
              style={{ borderColor: dept.color }}
            >
              <div
                className="flex items-center gap-2.5 px-3.5 py-2.5 text-white 2xl:px-4 2xl:py-3"
                style={{ background: `linear-gradient(120deg, ${dept.color} 0%, ${darkenColor(dept.color)} 100%)` }}
              >
                <Icon className="h-5 w-5 2xl:h-6 2xl:w-6" />
                <h3 className="flex-1 text-sm font-extrabold lg:text-base 2xl:text-lg">{deptName(dept)}</h3>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold">
                  {done}/{deptTasks.length}
                </span>
              </div>
              <ul className="flex-1 divide-y divide-slate-200/70 dark:divide-slate-700/60">
                {deptTasks.map((task, index) => {
                  const completed = task.status === 'completed';
                  return (
                    <li
                      key={task.id}
                      className={cn(
                        'flex items-start gap-2.5 px-3.5 py-2.5 transition-colors 2xl:gap-3 2xl:px-4 2xl:py-3.5',
                        completed
                          ? 'bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/40'
                          : 'hover:bg-white dark:hover:bg-slate-800'
                      )}
                    >
                      <button
                        onClick={() => toggleTask.mutate({ taskId: task.id, done: !completed })}
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-150 hover:scale-110 active:scale-90 2xl:h-8 2xl:w-8',
                          completed
                            ? 'border-emerald-500 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow'
                            : 'border-slate-300 bg-white hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-900'
                        )}
                        title={t('display.tapToComplete')}
                        aria-label={t('display.tapToComplete')}
                      >
                        {completed && <Check className="h-4 w-4 2xl:h-5 2xl:w-5" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100 lg:text-[15px] 2xl:text-lg',
                            completed && 'text-slate-400 line-through dark:text-slate-500'
                          )}
                        >
                          <span className="mr-1.5 text-slate-300 dark:text-slate-600">{index + 1}.</span>
                          {task.title}
                        </p>
                        {!isRichTextEmpty(task.description) && !completed && (
                          <RichTextViewer html={task.description} className="mt-1 text-sm text-slate-500" />
                        )}
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 2xl:text-sm">
                          {(task.work_location || task.setup_location) && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" /> {task.work_location || task.setup_location}
                            </span>
                          )}
                          {task.start_time && (
                            <span className="inline-flex items-center gap-1 font-semibold">
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

  return (
    <div className="space-y-6">
      {events.map((event) => {
        const isCollapsed = collapsed.has(event.id);
        const anyVisibleTask = event.tasks.some((task) => !selectedDept || task.department_id === selectedDept);
        if (selectedDept && !anyVisibleTask) return null;
        const totalTasks = event.tasks.length;
        const doneTasks = event.tasks.filter((task) => task.status === 'completed').length;
        const sessionIds = new Set(event.sessions.map((s) => s.id));
        const generalTasks = event.tasks.filter((task) => !task.session_id || !sessionIds.has(task.session_id));
        return (
          <section
            key={event.id}
            className="animate-slide-up overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-xl dark:bg-slate-900"
          >
            {/* Clickable gradient header: collapse / full details */}
            <header
              onClick={() => toggleCollapsed(event.id)}
              className="cursor-pointer select-none px-5 py-4 transition-all 2xl:px-8 2xl:py-5"
              style={{
                background: `linear-gradient(135deg, ${event.header_color} 0%, ${darkenColor(event.header_color)} 100%)`,
                color: event.header_text_color
              }}
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <h2 className="text-xl font-extrabold tracking-tight lg:text-2xl 2xl:text-4xl">{event.name}</h2>
                <span className="flex items-center gap-2 text-sm font-semibold opacity-90 lg:text-base 2xl:text-xl">
                  <CalendarDays className="h-4 w-4 2xl:h-5 2xl:w-5" /> {formatDate(event.event_date, lang, 'EEEE d MMMM yyyy')}
                </span>
                {event.location && (
                  <span className="flex items-center gap-2 text-sm font-semibold opacity-90 lg:text-base 2xl:text-xl">
                    <MapPin className="h-4 w-4 2xl:h-5 2xl:w-5" /> {event.location}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-sm font-bold 2xl:text-base"
                    style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                  >
                    {doneTasks}/{totalTasks} <Check className="ml-0.5 inline h-4 w-4" strokeWidth={3} />
                  </span>
                  <ChevronDown
                    className={cn('h-6 w-6 opacity-80 transition-transform duration-300', isCollapsed && '-rotate-90')}
                  />
                </span>
              </div>
              {!isCollapsed && (
                <>
                  {milestones(event).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {milestones(event).map((m) => {
                        const sameDay = extractDate(m.value) === event.event_date;
                        return (
                          <span
                            key={m.label}
                            className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-bold backdrop-blur transition-transform hover:scale-105 lg:text-sm 2xl:px-3 2xl:py-1.5 2xl:text-base"
                          >
                            {m.label} {sameDay ? '' : `${formatDate(m.value, lang, 'd MMM')} `}{formatTime(m.value, lang)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {!isRichTextEmpty(event.description) && (
                    <RichTextViewer html={event.description} className="mt-3 max-w-4xl !text-inherit opacity-95" />
                  )}
                  <AttachmentChips files={event.attachments} />
                </>
              )}
            </header>

            {/* Task groups: sessions or whole event */}
            {!isCollapsed && (
              <div className="space-y-4 p-4 2xl:p-6">
                {event.sessions.length === 0 ? (
                  renderPanels(event.tasks)
                ) : (
                  <>
                    {generalTasks.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 dark:bg-slate-800">
                          <Layers className="h-4 w-4 text-slate-400" />
                          <span className="text-sm font-extrabold text-slate-600 dark:text-slate-300 2xl:text-base">
                            {t('sessions.generalTasks')}
                          </span>
                        </div>
                        {renderPanels(generalTasks)}
                      </div>
                    )}
                    {event.sessions.map((session) => {
                      const sessionTasks = event.tasks.filter((task) => task.session_id === session.id);
                      if (sessionTasks.length === 0) return null;
                      const panels = renderPanels(sessionTasks);
                      if (!panels) return null;
                      return (
                        <div key={session.id} className="space-y-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-gradient-to-r from-navy-800 to-navy-600 px-4 py-2.5 text-white shadow-sm">
                            <Layers className="h-4 w-4 text-gold-400" />
                            <span className="text-sm font-extrabold 2xl:text-base">
                              {session.title || formatDate(session.session_date, lang, 'EEEE d MMMM')}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-white/80 2xl:text-sm">
                              <CalendarDays className="h-3.5 w-3.5" /> {formatDate(session.session_date, lang)}
                            </span>
                            {session.location && (
                              <span className="flex items-center gap-1.5 text-xs text-white/80 2xl:text-sm">
                                <MapPin className="h-3.5 w-3.5" /> {session.location}
                              </span>
                            )}
                            {session.start_time && (
                              <span className="flex items-center gap-1.5 text-xs text-white/80 2xl:text-sm">
                                <Clock className="h-3.5 w-3.5" /> {formatTime(session.start_time, lang)}
                                {session.end_time && <> - {formatTime(session.end_time, lang)}</>}
                              </span>
                            )}
                          </div>
                          {panels}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
