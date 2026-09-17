import { blockIsDone, inScope, outstandingTasks, type BoardScope } from '../../lib/boardScope';
import { BoardEditableText } from './BoardEditableText';
import { sessionTimeline } from '../../lib/sessionTimeline';
import { FloorPlanPreview } from './FloorPlanPreview';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AlarmClock, CalendarDays, CalendarRange, Check, ChevronDown, ChevronRight, CircleCheckBig, Clock, LayoutList,
  ListChecks, Map as MapIcon, MapPin, Megaphone, MessageCircleQuestion, Pencil, TriangleAlert, User
} from 'lucide-react';
import { useToggleDisplayTask } from '../../hooks/usePublicDisplay';
import { useLanguage } from '../../i18n';
import { EmptyState } from '../ui/EmptyState';
import {
  AttachmentChips, CountPill, EventBriefing, EventClosingBar, FactChip, StatusBadge, boardStatus, openAttachment
} from './EventBriefing';
import { BoardSkeleton } from './BoardSkeleton';
import { AskQuestionModal } from './AskQuestionModal';
import { categoryIcon, departmentIcon } from '../../lib/constants';
import {
  cn, darkenColor, extractDate, formatDate, formatTime, isRichTextEmpty, lightenColor, readableTextColor
} from '../../lib/utils';
import type { DisplayDepartment, DisplayEvent, DisplaySession, DisplayTask } from '../../types';

/**
 * Distinct, deep gradients for session date bars. When one event runs across
 * several dates, each date gets its own colour so staff never confuse one day
 * with another. A single-date event keeps the default navy (index 0). All are
 * dark enough for white text to stay readable.
 */
const SESSION_BAR_GRADIENTS = [
  'linear-gradient(135deg, #0f2744 0%, #1a3c5e 55%, #2d5a87 100%)', // navy
  'linear-gradient(135deg, #0f3d3e 0%, #115e59 55%, #0f766e 100%)', // teal
  'linear-gradient(135deg, #3b1d4e 0%, #5b2a6e 55%, #7e3f9d 100%)', // plum
  'linear-gradient(135deg, #14331f 0%, #166534 55%, #15803d 100%)', // forest
  'linear-gradient(135deg, #3f1518 0%, #7f1d1d 55%, #b3341f 100%)', // brick
  'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4f46e5 100%)'  // indigo
];

/**
 * How the board reads. 'date' merges every event into one running order by
 * session date, so a short event sitting between the days of a longer one
 * cannot be scrolled past. 'event' keeps the original one card per event view.
 */
type BoardView = 'date' | 'event';

const BOARD_VIEW_KEY = 'eventops.display.boardView';

function readBoardView(): BoardView {
  try {
    return localStorage.getItem(BOARD_VIEW_KEY) === 'event' ? 'event' : 'date';
  } catch {
    return 'date';
  }
}

type TimelineEventGroup = { event: DisplayEvent; blocks: ReturnType<typeof sessionTimeline>[number]['block'][] };

interface EventsBoardProps {
  events: DisplayEvent[] | undefined;
  departments: DisplayDepartment[];
  selectedDept: string;
  isLoading: boolean;
  /** 'active' hides finished work and days already gone; 'done' shows only those */
  scope?: BoardScope;
  focusEventId?: string;
  focusTaskId?: string;
  /** Live editing: pencils appear on events, sessions and tasks when true */
  editMode?: boolean;
  onEditEvent?: (event: DisplayEvent) => void;
  onEditSession?: (event: DisplayEvent, session: DisplaySession) => void;
  onEditTask?: (event: DisplayEvent, task: DisplayTask) => void;
}

export function EventsBoard({
  events,
  departments,
  selectedDept,
  isLoading,
  scope = 'active',
  focusEventId = '',
  focusTaskId = '',
  editMode,
  onEditEvent,
  onEditSession,
  onEditTask
}: EventsBoardProps) {
  const { t, deptName, lang } = useLanguage();
  const toggleTask = useToggleDisplayTask();
  // Events open collapsed, so the board reads as a clean overview first and
  // staff expand only the event they are working on.
  const [expanded, setExpanded] = useState<Set<string>>(new Set(focusEventId ? [focusEventId] : []));
  const [boardNow, setBoardNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setBoardNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  /** Which event the "Ask a question" dialog is open for */
  const [askEvent, setAskEvent] = useState<DisplayEvent | null>(null);
  const [viewMode, setViewMode] = useState<BoardView>(() => focusEventId ? 'event' : readBoardView());

  useEffect(() => {
    try {
      if (!focusEventId) localStorage.setItem(BOARD_VIEW_KEY, viewMode);
    } catch {
      // Storage can be blocked on a shared display; the choice just lasts this visit
    }
  }, [viewMode, focusEventId]);

  useEffect(() => {
    if (isLoading || !focusTaskId) return;
    const timer = window.setTimeout(() => {
      const element = document.getElementById(`task-${focusTaskId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.focus({ preventScroll: true });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [isLoading, focusTaskId]);

  /** Jump from an upcoming task card to its event: expand, scroll, flash */
  const goToEvent = (eventId: string) => {
    setViewMode('event');
    setExpanded((prev) => new Set(prev).add(eventId));
    setHighlighted(eventId);
    window.setTimeout(() => {
      document.getElementById(`event-${eventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    window.setTimeout(() => setHighlighted(null), 2600);
  };

  const toggleExpanded = (eventId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  if (isLoading) return <BoardSkeleton />;
  if (!events || events.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <EmptyState icon={CalendarDays} message={t('display.noEvents')} />
      </div>
    );
  }

  /**
   * Department panels. Tasks are deliberately lightweight: the date, time and
   * venue belong to the event, so they are stated once in the briefing above
   * and never repeated per task.
   */
  const renderPanels = (tasks: DisplayTask[], evt: DisplayEvent): ReactNode => {
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
        {visibleDepts.map((dept, deptIndex) => {
          const Icon = departmentIcon(dept.icon);
          const deptTasks = tasks.filter((task) => task.department_id === dept.id);
          const done = deptTasks.filter((task) => task.status === 'completed').length;
          const deptText = readableTextColor(dept.color);
          const allDone = done === deptTasks.length && deptTasks.length > 0;
          return (
            <div
              key={dept.id}
              className="flex animate-rise-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              style={{ borderLeft: `5px solid ${dept.color}`, animationDelay: `${Math.min(deptIndex, 5) * 60}ms` }}
            >
              {/* A tint of the department colour rather than a block of it: four of
                  these side by side used to shout louder than the work itself. The
                  label colour is set per theme so it stays readable either way. */}
              <div
                className="flex items-center gap-2.5 border-b bg-[color:var(--dept-tint)] px-4 py-2.5 dark:bg-[color:var(--dept-tint-dark)]"
                style={
                  {
                    borderBottomColor: `${dept.color}33`,
                    '--dept-tint': `${dept.color}12`,
                    '--dept-tint-dark': `${dept.color}24`,
                    '--dept-ink': darkenColor(dept.color, 0.78),
                    '--dept-ink-dark': lightenColor(dept.color, 0.55)
                  } as React.CSSProperties
                }
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: dept.color, color: deptText }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="flex-1 truncate text-[0.95rem] font-extrabold text-[color:var(--dept-ink)] dark:text-[color:var(--dept-ink-dark)]">
                  {deptName(dept)}
                </h3>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums',
                    allDone
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-white text-[color:var(--dept-ink)] shadow-sm dark:bg-slate-900 dark:text-[color:var(--dept-ink-dark)]'
                  )}
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
                      id={`task-${task.id}`}
                      tabIndex={focusTaskId === task.id ? -1 : undefined}
                      className={cn(
                        'px-4 py-3 transition-colors duration-150',
                        focusTaskId === task.id && 'ring-4 ring-inset ring-gold-400',
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
                            "relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-150 after:absolute after:-inset-2 after:content-['']  focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-90",
                            completed
                              ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                              : 'border-slate-300 bg-white hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-900'
                          )}
                          title={t('display.tapToComplete')}
                          aria-label={t('display.tapToComplete')}
                          aria-pressed={completed}
                        >
                          {completed && <Check className="h-4 w-4 animate-tick-pop" strokeWidth={3} />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              'flex items-start gap-2 break-words text-[0.95rem] font-semibold leading-snug text-slate-800 dark:text-slate-100',
                              completed && 'text-slate-400 line-through dark:text-slate-500'
                            )}
                          >
                            <span className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[0.7rem] font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1"><BoardEditableText entity="task" id={task.id} eventId={evt.id} field="title" value={task.title} label={t('tasks.taskTitle')} /></span>
                          </div>

                          {!isRichTextEmpty(task.description) && !completed && (
                            <BoardEditableText entity="task" id={task.id} eventId={evt.id} field="description" value={task.description} rich label={t('tasks.taskDescription')} className="mt-1 block pl-7 text-sm text-slate-500 dark:text-slate-400" />
                          )}

                          {hasMeta && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-7">
                              {task.assigned_staff && !completed && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  <User className="h-3.5 w-3.5" /> <BoardEditableText entity="task" id={task.id} eventId={evt.id} field="assigned_staff" value={task.assigned_staff} label={t('tasks.assignedStaff')} />
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
                            <BoardEditableText entity="task" id={task.id} eventId={evt.id} field="notes" value={task.notes} rich label={t('common.notes')} className="mt-1 block pl-7 text-sm italic text-slate-400" />
                          )}
                        </div>
                        {editMode && (
                          <button
                            onClick={() => onEditTask?.(evt, task)}
                            title={t('tasks.editTask')}
                            aria-label={t('tasks.editTask')}
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 hover:text-navy-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 dark:bg-slate-800 dark:text-slate-400"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
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

  /** A session states its own date, place and time once, above its panels. */
  const sessionHeader = (
    session: DisplaySession,
    tasks: DisplayTask[],
    evt: DisplayEvent,
    barGradient: string
  ): ReactNode => {
    const done = tasks.filter((task) => task.status === 'completed').length;
    return (
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3.5 text-white shadow-md"
        style={{ backgroundImage: barGradient }}
      >
        <span className="flex h-12 w-12 shrink-0 flex-col overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/10">
          <span className="flex h-[1.1rem] items-center justify-center bg-gold-700 text-[0.55rem] font-extrabold uppercase tracking-wide text-white">
            {formatDate(session.session_date, lang, 'MMM')}
          </span>
          <span className="flex flex-1 items-center justify-center text-xl font-extrabold leading-none text-navy-900">
            {formatDate(session.session_date, lang, 'd')}
          </span>
        </span>
        <div className="min-w-0">
          <div className="text-lg font-extrabold tracking-tight">
            <BoardEditableText entity="session" id={session.id} eventId={evt.id} field="title" value={session.title} placeholder={formatDate(session.session_date, lang, 'EEEE d MMMM')} label={t('sessions.title')} />
          </div>
          {/* The full date is already spelled out in the block on the left, so it
              stays quiet here and the place and the time carry the solid chips. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <FactChip icon={CalendarDays} tone="quiet">{formatDate(session.session_date, lang)}</FactChip>
            {session.location && (
              <FactChip icon={MapPin} tone="strong">
                <BoardEditableText
                  entity="session"
                  id={session.id}
                  eventId={evt.id}
                  field="location"
                  value={session.location}
                  label={t('common.location')}
                />
              </FactChip>
            )}
            {(session.start_time || session.end_time || session.time_note) && (
              <FactChip icon={Clock} tone="strong">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  {(session.start_time || session.end_time) && (
                    <span className="tabular-nums tracking-tight">
                      {session.start_time ? formatTime(session.start_time, lang) : '—'}
                      {session.end_time && <> - {formatTime(session.end_time, lang)}</>}
                    </span>
                  )}
                  {session.time_note && (
                    <span className="font-bold text-navy-600">
                      <BoardEditableText
                        entity="session"
                        id={session.id}
                        eventId={evt.id}
                        field="time_note"
                        value={session.time_note}
                        label={t('common.notes')}
                      />
                    </span>
                  )}
                </span>
              </FactChip>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {editMode && (
            <button
              onClick={() => onEditSession?.(evt, session)}
              title={t('sessions.editSession')}
              aria-label={t('sessions.editSession')}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white transition-all hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <CountPill done={done} total={tasks.length} />
        </div>
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

  // ---------- reading the board in date order ----------


  /** Tasks of one event that the current department filter keeps */
  const visibleTasks = (evt: DisplayEvent): DisplayTask[] =>
    evt.tasks.filter((task) => !selectedDept || task.department_id === selectedDept);

  /** Every date on which this event actually has work, earliest first */
  const workDates = (evt: DisplayEvent): string[] => {
    const tasks = visibleTasks(evt);
    if (tasks.length === 0 && selectedDept) return [];
    const eventSessions = evt.sessions ?? [];
    const ids = new Set(eventSessions.map((session) => session.id));
    const dates = new Set<string>();
    for (const session of eventSessions) {
      if (!selectedDept || tasks.some((task) => task.session_id === session.id)) dates.add(session.session_date);
    }
    if (eventSessions.length === 0 || tasks.some((task) => !task.session_id || !ids.has(task.session_id))) dates.add(evt.event_date);
    return [...dates].sort();
  };

  /** Other events whose work falls inside this event's own run of dates */
  const overlappingEvents = (evt: DisplayEvent): Array<{ event: DisplayEvent; dates: string[] }> => {
    const range = workDates(evt);
    // Only a run of two or more dates can have something slipped into the middle
    if (range.length < 2) return [];
    const first = range[0];
    const last = range[range.length - 1];
    return events
      .filter((other) => other.id !== evt.id)
      .map((other) => ({ event: other, dates: workDates(other).filter((d) => d >= first && d <= last) }))
      .filter((entry) => entry.dates.length > 0);
  };

  /**
   * One event split into the part that belongs in the scope being read. Work
   * sits in Done once its day is over or every task on it is ticked, so the
   * active board only ever carries what still has to happen.
   */
  const eventInScope = (evt: DisplayEvent) => {
    const all = evt.sessions ?? [];
    const ids = new Set(all.map((session) => session.id));
    // With a department chosen, Done means that department's own work is done
    const mine = visibleTasks(evt);
    const general = mine.filter((task) => !task.session_id || !ids.has(task.session_id));
    const generalShown = evt.id === focusEventId || inScope(blockIsDone(null, evt.event_date, general, boardNow), scope);
    const sessions = all.filter((session) =>
      evt.id === focusEventId || inScope(
        blockIsDone(session, session.session_date, mine.filter((task) => task.session_id === session.id), boardNow),
        scope
      )
    );
    const hasGeneral = generalShown && (general.length > 0 || all.length === 0);
    return { sessions, general, generalShown, any: sessions.length > 0 || hasGeneral };
  };

  /**
   * Work left open on a day that has already gone by. Inside Done this can only
   * happen when the day itself ran out, because a block whose tasks are all
   * ticked has nothing outstanding, so the count doubles as a follow up flag.
   */
  const followUpCount = (tasks: DisplayTask[]): number => (scope === 'done' ? outstandingTasks(tasks).length : 0);

  /** Operational note a session carries: OT, reminders, venue instructions */
  const sessionNoteBar = (session: DisplaySession, eventId: string): ReactNode => {
    if (!session.note) return null;
    return (
      <div className="flex items-start gap-2.5 rounded-xl border-l-4 border-amber-400 bg-amber-50 px-3.5 py-2.5 dark:border-amber-500 dark:bg-amber-950/40">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <div className="text-[0.62rem] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            {t('sessions.sessionNote')}
          </div>
          <div className="mt-0.5 whitespace-pre-line break-words text-sm font-semibold leading-relaxed text-amber-900 dark:text-amber-100">
            <BoardEditableText entity="session" id={session.id} eventId={eventId} field="note" value={session.note} label={t('sessions.sessionNote')} />
          </div>
        </div>
      </div>
    );
  };

  /** One event's work on one day, inside the date ordered view */
  const renderTimelineGroup = (date: string, group: TimelineEventGroup, order = 0): ReactNode => {
    const evt = group.event;
    const openWork = followUpCount(group.blocks.flatMap((block) => block.tasks));
    const headerColor = evt.header_color || '#1a3c5e';
    const headerText = evt.header_text_color || '#ffffff';
    const CategoryIcon = categoryIcon(evt.category);
    const dates = workDates(evt);
    const dayIndex = Math.max(1, dates.indexOf(date) + 1);
    const dateOrder = Array.from(new Set((evt.sessions ?? []).map((session) => session.session_date)));
    const gradientFor = (sessionDate: string) =>
      SESSION_BAR_GRADIENTS[Math.max(0, dateOrder.indexOf(sessionDate)) % SESSION_BAR_GRADIENTS.length];
    const plans = evt.attachments.filter((file) => file.mime_type.startsWith('image/') && !(evt.sessions ?? []).some(session => session.floor_plan_attachment_id === file.id));

    return (
      <div
        key={group.blocks[0].key}
        data-timeline-event={evt.id}
        className="animate-rise-in overflow-hidden rounded-2xl border bg-white shadow-[0_10px_28px_-16px_var(--event-glow)] transition-shadow duration-300 hover:shadow-[0_18px_40px_-16px_var(--event-glow)] dark:bg-slate-900"
        style={{
          '--event-glow': headerColor + '66',
          borderColor: headerColor + '80',
          // Cards land in reading order. Capped so a long day never waits.
          animationDelay: `${Math.min(order, 8) * 70}ms`
        } as React.CSSProperties}
      >
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
          style={{
            background: 'linear-gradient(120deg, ' + headerColor + ' 0%, ' + darkenColor(headerColor, 0.82) + ' 100%)',
            color: headerText
          }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: headerText + '26' }}
          >
            <CategoryIcon className="h-5 w-5" />
          </span>
          <h3 className="min-w-0 truncate text-lg font-black tracking-tight" style={{ color: headerText }}>
            <BoardEditableText entity="event" id={evt.id} eventId={evt.id} field="name" value={evt.name} label={t('events.eventName')} />
          </h3>
          <StatusBadge status={boardStatus(evt, nowMs)} />
          {dates.length > 1 && (
            <span
              className="rounded-lg px-2.5 py-1 text-xs font-bold"
              style={{ backgroundColor: headerText + '26' }}
            >
              {lang === 'th'
                ? 'วันที่ ' + dayIndex + ' จาก ' + dates.length
                : 'day ' + dayIndex + ' of ' + dates.length}
            </span>
          )}
          {/* This day has gone by with work still open on it */}
          {openWork > 0 && (
            <span
              title={t('display.leftOpenHint')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-amber-950"
            >
              <TriangleAlert className="h-3.5 w-3.5" /> {openWork} {t('display.leftOpen')}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {editMode && <button type="button" onClick={() => onEditEvent?.(evt)} aria-label={`${t('events.editEvent')}: ${evt.name}`} className="rounded-lg bg-white/20 p-2 hover:bg-white/30"><Pencil className="h-4 w-4" /></button>}
            {/* The plan opens straight on the board, without leaving this view */}
            {plans.length > 0 && (
              <button
                onClick={() => openAttachment(plans[0], plans)}
                title={t('display.viewFloorPlan')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-extrabold text-navy-800 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <MapIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{t('display.floorPlan')}</span>
              </button>
            )}
            <button
              onClick={() => goToEvent(evt.id)}
              title={t('display.openEvent')}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{ backgroundColor: headerText + '26', color: headerText }}
            >
              <span className="hidden sm:inline">{t('display.openEvent')}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </span>
        </div>

        <div className="space-y-4 p-3 lg:p-4">
          {group.blocks.map((block) => (
            <div key={block.key} className="space-y-3">
              {block.session ? (
                <>
                  {sessionHeader(block.session, block.tasks, evt, gradientFor(block.session.session_date))}
                  {sessionNoteBar(block.session, evt.id)}
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-100/60 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/30">
                  <ListChecks className="h-5 w-5 shrink-0 text-slate-400" />
                  <span className="text-base font-extrabold tracking-tight text-slate-500 dark:text-slate-300">
                    {t('sessions.generalTasks')} · {formatDate(date, lang)}
                  </span>
                </div>
              )}
              {/* Only a plan that belongs to this session is shown here. The plan for
                  the whole event is one tap away on the header, and is shown in full
                  inside the event card, so a long day no longer repeats the same
                  drawing under every session. */}
              {block.session?.floor_plan && (
                <FloorPlanPreview
                  file={block.session.floor_plan}
                  label={block.session.title ? `${t('display.floorPlan')} · ${block.session.title}` : t('display.floorPlan')}
                />
              )}
              {renderPanels(block.tasks, evt)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** Shown when the scope being read has nothing in it */
  const scopeEmptyState = (
    <div className="mx-auto max-w-xl py-16">
      <EmptyState
        icon={scope === 'done' ? CircleCheckBig : ListChecks}
        message={scope === 'done' ? t('display.doneEmpty') : t('display.activeEmpty')}
      />
    </div>
  );

  const renderTimeline = (): ReactNode => {
    const entries = sessionTimeline(events, selectedDept).filter(({ date, event, block }) =>
      event.id === focusEventId || inScope(blockIsDone(block.session, block.session?.session_date ?? date ?? event.event_date, block.tasks, boardNow), scope)
    );
    if (entries.length === 0) return scopeEmptyState;
    return (
      <div className="space-y-6">
        {entries.map(({ date, event, block }, order) => renderTimelineGroup(date, { event, blocks: [block] }, order))}
      </div>
    );
  };

  /** Events that still have something to show in the scope being read */
  const eventsInScope = events
    .filter((event) => !selectedDept || event.tasks.some((task) => task.department_id === selectedDept))
    .map((event) => ({ event, scoped: eventInScope(event) }))
    .filter((entry) => entry.scoped.any);

  const viewToggle = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex shrink-0 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {([
          ['date', CalendarRange, t('display.viewByDate')],
          ['event', LayoutList, t('display.viewByEvent')]
        ] as Array<[BoardView, typeof CalendarRange, string]>).map(([mode, Icon, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            aria-pressed={viewMode === mode}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500',
              viewMode === mode
                ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {viewMode === 'date' && (
        <div className="w-full text-sm leading-relaxed text-slate-500 sm:min-w-48 sm:flex-1 dark:text-slate-400">{t('display.dateViewHint')}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {viewToggle}
      {viewMode === 'event' && upcoming.length > 0 && (
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
                  role="button"
                  tabIndex={0}
                  onClick={() => goToEvent(event.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goToEvent(event.id);
                    }
                  }}
                  title={t('display.tapToView')}
                  aria-label={`${task.title} - ${t('display.tapToView')}`}
                  className={cn(
                    'flex w-64 shrink-0 cursor-pointer flex-col gap-1.5 rounded-2xl border bg-white p-3 shadow-sm transition-all duration-200  hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 dark:bg-slate-900',
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
                      <span className="animate-pulse rounded-full bg-amber-500 px-2 py-0.5 text-[0.65rem] font-extrabold text-white shadow-sm">
                        {soon}
                      </span>
                    )}
                  </div>
                  <div className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">{task.title}</div>
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

      {/* Keyed so a change of view or of scope plays the entrance again and the
          board visibly answers the tap, instead of swapping content in silence. */}
      <div key={`${viewMode}-${scope}-${selectedDept}`} className="animate-fade-in space-y-6">
      {viewMode === 'date' && renderTimeline()}

      {viewMode === 'event' && eventsInScope.length === 0 && scopeEmptyState}

      {viewMode === 'event' && eventsInScope.map(({ event, scoped }, cardOrder) => {
        const isCollapsed = !expanded.has(event.id);
        const totalTasks = event.tasks.length;
        const doneTasks = event.tasks.filter((task) => task.status === 'completed').length;
        const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
        const headerColor = event.header_color || '#1a3c5e';
        const headerText = event.header_text_color || '#ffffff';
        const CategoryIcon = categoryIcon(event.category);
        const status = boardStatus(event, nowMs);
        // Anything from another event that lands between this event's own days
        const overlaps = overlappingEvents(event);
        const allSessions = event.sessions ?? [];
        const sessions = scoped.sessions;
        const generalTasks = scoped.generalShown ? scoped.general : [];
        const openWork = followUpCount([...generalTasks, ...sessions.flatMap((session) => event.tasks.filter((task) => task.session_id === session.id))]);
        // Give every distinct session date its own bar colour (stable order).
        const sessionDateOrder = Array.from(new Set(allSessions.map((s) => s.session_date)));
        const barGradientFor = (date: string) =>
          SESSION_BAR_GRADIENTS[Math.max(0, sessionDateOrder.indexOf(date)) % SESSION_BAR_GRADIENTS.length];

        return (
          <section
            key={event.id}
            id={`event-${event.id}`}
            className={cn(
              'animate-rise-in scroll-mt-4 overflow-hidden rounded-2xl border bg-white transition-all duration-300 shadow-sm hover:shadow-md dark:bg-slate-900',
              highlighted === event.id && 'ring-4 ring-gold-400/80'
            )}
            style={{
              '--event-glow': `${headerColor}66`,
              borderColor: `${headerColor}80`,
              animationDelay: `${Math.min(cardOrder, 8) * 70}ms`
            } as React.CSSProperties}
          >
            <div className="h-2" style={{ backgroundColor: headerColor }} />

            {/* Event identity: name, live status and progress */}
            <header
              role="button"
              tabIndex={0}
              aria-expanded={!isCollapsed}
              onClick={() => toggleExpanded(event.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpanded(event.id);
                }
              }}
              className="flex cursor-pointer select-none flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-gold-400/80 lg:px-7"
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
                  <BoardEditableText entity="event" id={event.id} eventId={event.id} field="name" value={event.name} label={t('events.eventName')} />
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold"
                    style={{ backgroundColor: `${headerText}26` }}
                  >
                    <CalendarDays className="h-4 w-4" /> {formatDate(event.event_date, lang, 'EEE d MMM yyyy')}
                  </span>
                  {openWork > 0 && (
                    <span
                      title={t('display.leftOpenHint')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-2.5 py-1 text-sm font-extrabold text-amber-950"
                    >
                      <TriangleAlert className="h-4 w-4" /> {openWork} {t('display.leftOpen')}
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {editMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditEvent?.(event);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    style={{ backgroundColor: `${headerText}26`, color: headerText }}
                    title={t('events.editEvent')}
                    aria-label={`${t('events.editEvent')}: ${event.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="hidden lg:inline">{t('common.edit')}</span>
                  </button>
                )}
                {/* Available on every event bar, open or collapsed */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAskEvent(event);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  style={{ backgroundColor: `${headerText}26`, color: headerText }}
                  title={t('display.askQuestion')}
                  aria-label={`${t('display.askQuestion')}: ${event.name}`}
                >
                  <MessageCircleQuestion className="h-4 w-4" />
                  <span className="hidden lg:inline">{t('display.askQuestion')}</span>
                </button>
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-black tabular-nums" style={{ color: headerText }}>
                    {doneTasks}/{totalTasks}
                  </span>
                  <span className="mt-1 block h-2 w-28 overflow-hidden rounded-full" style={{ backgroundColor: `${headerText}33` }}>
                    <span
                      className="block h-full rounded-full transition-[width,background-color] duration-700 ease-out"
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

            {/* A longer event can have another event slipped between its days */}
            {overlaps.length > 0 && (
              <div className="flex flex-wrap items-start gap-3 border-b border-l-4 border-slate-100 border-l-amber-400 bg-amber-50/50 px-5 py-3 dark:border-slate-800 dark:border-l-amber-500 dark:bg-amber-950/30 lg:px-7">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-amber-800 dark:text-amber-200">
                    {t('display.overlapTitle')}
                  </div>
                  <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{t('display.overlapHint')}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {overlaps.map(({ event: other, dates }) => (
                      <button
                        key={other.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToEvent(other.id);
                        }}
                        title={t('display.tapToView')}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: other.header_color || '#1a3c5e' }}
                        />
                        <span className="tabular-nums">
                          {dates.map((d) => formatDate(d, lang, 'd MMM')).join(', ')}
                        </span>
                        <span className="truncate">{other.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!isCollapsed && (
              <div className="px-5 pb-5 pt-4 lg:px-7">
                {/* Everything the whole event needs, stated once */}
                <EventBriefing event={event} />

                <div className="mt-5">
                  {allSessions.length === 0 ? (
                    renderPanels(generalTasks, event)
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
                          {renderPanels(generalTasks, event)}
                        </div>
                      )}
                      {sessions.map((session) => {
                        const sessionTasks = event.tasks.filter((task) => task.session_id === session.id);
                        if (sessionTasks.length === 0 && selectedDept) return null;
                        const panels = renderPanels(sessionTasks, event);
                        if (!panels && selectedDept) return null;
                        return (
                          <div
                            key={session.id}
                            className="space-y-4 rounded-2xl border border-navy-100 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/40"
                          >
                            {sessionHeader(session, sessionTasks, event, barGradientFor(session.session_date))}
                            {/* Operational note for this session: OT, reminders, venue instructions */}
                            {sessionNoteBar(session, event.id)}
                            {session.floor_plan && <FloorPlanPreview file={session.floor_plan} label={`${t('display.floorPlan')} · ${session.title || formatDate(session.session_date, lang)}`} />}
                            {panels}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* The last line staff read before they leave */}
                <EventClosingBar event={event} />
              </div>
            )}
          </section>
        );
      })}

      </div>

      <AskQuestionModal
        open={askEvent !== null}
        onClose={() => setAskEvent(null)}
        eventId={askEvent?.id ?? ''}
        eventName={askEvent?.name ?? ''}
        departments={departments}
      />
    </div>
  );
}
