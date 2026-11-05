import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Bell, CalendarDays, Clock, Import, LayoutTemplate, Layers, MapPin, Pencil, Plus,
  Table2, Trash2, Eye, LayoutGrid, Archive, ChevronDown
} from 'lucide-react';
import { useEvent, useEventMutations } from '../hooks/useEvents';
import { useArchiveMutations } from '../hooks/useArchive';
import { useDepartments } from '../hooks/useDepartments';
import { useAttachments } from '../hooks/useAttachments';
import { useTaskMutations } from '../hooks/useTasks';
import { useSessionMutations } from '../hooks/useSessions';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EventStatusBadge, Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { RichTextViewer } from '../components/editor/RichTextViewer';
import { EventTimeline } from '../components/events/EventTimeline';
import { DepartmentSection } from '../components/events/DepartmentSection';
import { TaskGrid } from '../components/events/TaskGrid';
import { TaskFormModal } from '../components/events/TaskFormModal';
import { TaskDetailModal } from '../components/events/TaskDetailModal';
import { NotifyModal } from '../components/events/NotifyModal';
import { SaveTemplateModal } from '../components/events/SaveTemplateModal';
import { SessionFormModal } from '../components/events/SessionFormModal';
import { HiddenSessionBadge, SessionControls } from '../components/events/SessionControls';
import { EventContacts } from '../components/events/EventContacts';
import { EventCheckStrip } from '../components/events/EventCheckStrip';
import { SessionNotifyModal, unsentTasks } from '../components/events/SessionNotifyModal';
import { SessionImportModal } from '../components/events/SessionImportModal';
import { AuditHistory } from '../components/events/AuditHistory';
import { AttachmentSection } from '../components/attachments/AttachmentSection';
import { ArchivedBanner, useArchiveFeedback } from '../components/archive/ArchiveControls';
import { eventArchiveReason } from '../lib/archive';
import { cn, combineDateTime, formatDate, formatTime, isRichTextEmpty, formatDateRange } from '../lib/utils';
import { normalizeTimeInput } from '../lib/grid';
import { sessionColor } from '../lib/sessionColors';
import { copyTasks, getTaskClipboard, taskToClipboardItem } from '../lib/taskClipboard';
import type { EventSession, EventTask } from '../types';

type ViewMode = 'grid' | 'overview' | 'department';

const VIEW_MODE_KEY = 'eventops.eventViewMode';

function readViewMode(): ViewMode | null {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'overview' || saved === 'department') return saved;
  } catch {
    // Storage can be blocked; the default is fine
  }
  return null;
}

function useWideScreen() {
  const [wideScreen, setWideScreen] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 768px)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setWideScreen(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return wideScreen;
}

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { isEventsTeam, profile } = useAuth();

  const { data: event, isLoading, error } = useEvent(id);
  const { data: departments } = useDepartments();
  const { data: attachments } = useAttachments('event', id);
  const { deleteEvent, updateEvent } = useEventMutations();
  const { archiveEvents, restoreEvents } = useArchiveMutations();
  const reportArchive = useArchiveFeedback();
  const { createTask, createTasks, updateTask, deleteTask } = useTaskMutations(id);
  const { deleteSession } = useSessionMutations(id ?? '');

  const [viewMode, setViewMode] = useState<ViewMode | null>(readViewMode);
  const wideScreen = useWideScreen();
  const effectiveView = viewMode ?? (isEventsTeam && wideScreen ? 'grid' : 'overview');
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);
  const showDetails = detailsOpen ?? (!isEventsTeam || !event?.event_tasks.length);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskFormDeptId, setTaskFormDeptId] = useState<string | undefined>();
  const [taskFormSessionId, setTaskFormSessionId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<EventTask | null>(null);
  const [viewingTask, setViewingTask] = useState<EventTask | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notifySession, setNotifySession] = useState<EventSession | null>(null);
  const [sessionModal, setSessionModal] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    session: EventSession | null;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingSession, setDeletingSession] = useState<EventSession | null>(null);
  const [deletingTask, setDeletingTask] = useState<EventTask | null>(null);
  const [notifyDeptIds, setNotifyDeptIds] = useState<string[] | null>(null);

  useEffect(() => { setDetailsOpen(null); }, [id]);

  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || !event) return;
    const task = event.event_tasks.find(item => item.id === taskId);
    if (task) setViewingTask(task);
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    setSearchParams(next, { replace: true });
  }, [event, searchParams, setSearchParams]);

  const sortedDepartments = departments ?? [];

  const visibleDepartments = useMemo(() => {
    if (effectiveView === 'department') {
      const targetId = selectedDeptId || profile?.department_id || sortedDepartments[0]?.id;
      return sortedDepartments.filter((d) => d.id === targetId);
    }
    return sortedDepartments;
  }, [effectiveView, selectedDeptId, sortedDepartments, profile?.department_id]);

  if (isLoading) return <Spinner />;
  if (error || !event) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-500">{t('errors.loadFailed')}</p>
        <Link to="/events" className="mt-3 inline-block"><Button variant="outline">{t('common.back')}</Button></Link>
      </div>
    );
  }

  const sessions = event.event_sessions;
  const sessionIds = new Set(sessions.map((s) => s.id));
  const generalTasks = event.event_tasks.filter((task) => !task.session_id || !sessionIds.has(task.session_id));
  const departmentsWithTasks = sortedDepartments.filter((d) =>
    event.event_tasks.some((task) => task.department_id === d.id)
  );

  /** Next free position inside one department of one session */
  const nextSortOrder = (sessionId: string | null, departmentId: string) =>
    event.event_tasks
      .filter((task) => (task.session_id ?? null) === sessionId && task.department_id === departmentId)
      .reduce((max, task) => Math.max(max, task.sort_order), -1) + 1;

  const openAddTask = (departmentId: string, sessionId: string | null) => {
    setEditingTask(null);
    setTaskFormDeptId(departmentId);
    setTaskFormSessionId(sessionId);
    setTaskFormOpen(true);
  };

  const openEditTask = (task: EventTask) => {
    setViewingTask(null);
    setEditingTask(task);
    setTaskFormDeptId(task.department_id);
    setTaskFormSessionId(task.session_id);
    setTaskFormOpen(true);
  };

  const handleDelete = async () => {
    await deleteEvent.mutateAsync(event.id);
    toast(t('common.deletedSuccess'));
    navigate('/events');
  };

  const isArchived = event.status === 'archived';
  const canArchive = isEventsTeam && 'archived_at' in event && !!eventArchiveReason(event);

  /** Back to the status it had before, or completed when that is not known */
  const handleRestore = async () => {
    try {
      const changed = await restoreEvents.mutateAsync([{ id: event.id, status_before_archive: event.status_before_archive }]);
      reportArchive(changed, 1, 'archive.restoredCount');
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const handleArchive = async () => {
    const previous = event.status;
    try {
      const changed = await archiveEvents.mutateAsync([event.id]);
      reportArchive(changed, 1, 'archive.archivedCount', async () => {
        try {
          reportArchive(await restoreEvents.mutateAsync([{ id: event.id, status_before_archive: previous }]), 1, 'archive.restoredCount');
        } catch {
          toast(t('common.errorGeneric'), 'error');
        }
      });
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  /** Put a task on the app clipboard so it can be pasted into any department, session or event */
  const handleCopyTask = (task: EventTask) => {
    copyTasks([taskToClipboardItem(task)], task.title);
    toast(t('tasks.copiedOne'));
  };

  const handleDuplicateTask = async (task: EventTask) => {
    try {
      await createTask.mutateAsync({
        event_id: event.id,
        department_id: task.department_id,
        session_id: task.session_id,
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        work_location: task.work_location,
        setup_location: task.setup_location,
        assigned_staff: task.assigned_staff,
        start_time: task.start_time,
        completion_time: task.completion_time,
        priority: task.priority,
        status: 'not_started',
        notes: task.notes,
        sort_order: nextSortOrder(task.session_id, task.department_id),
        created_by: profile?.id ?? null
      });
      toast(t('grid.duplicated'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const handlePasteTasks = async (departmentId: string, sessionId: string | null) => {
    const clip = getTaskClipboard();
    if (!clip) return;
    const start = nextSortOrder(sessionId, departmentId);
    try {
      await createTasks.mutateAsync(
        clip.items.map((item, index) => ({
          event_id: event.id,
          department_id: departmentId,
          session_id: sessionId,
          title: item.title,
          description: item.description,
          instructions: item.instructions,
          work_location: item.work_location,
          setup_location: item.setup_location,
          assigned_staff: item.assigned_staff,
          start_time: combineDateTime(event.event_date, item.start_time),
          completion_time: combineDateTime(event.event_date, item.completion_time),
          priority: item.priority,
          status: 'not_started' as const,
          notes: item.notes,
          sort_order: start + index,
          created_by: profile?.id ?? null
        }))
      );
      toast(`${t('grid.pasted')} ${clip.items.length}`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  /**
   * A block pasted into Quick Add becomes one task per line.
   * Extra tab separated columns fill staff, work location and start time.
   */
  const handleQuickAddMany = async (departmentId: string, sessionId: string | null, rows: string[][]) => {
    const start = nextSortOrder(sessionId, departmentId);
    const inputs = rows
      .map((cells, index) => ({
        event_id: event.id,
        department_id: departmentId,
        session_id: sessionId,
        title: (cells[0] ?? '').trim(),
        assigned_staff: (cells[1] ?? '').trim(),
        work_location: (cells[2] ?? '').trim(),
        start_time: combineDateTime(event.event_date, normalizeTimeInput(cells[3] ?? '') || null),
        sort_order: start + index,
        created_by: profile?.id ?? null
      }))
      .filter((input) => input.title !== '');
    if (inputs.length === 0) return;
    try {
      await createTasks.mutateAsync(inputs);
      toast(`${t('grid.rowsAdded')} ${inputs.length}`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const renderDepartmentGrid = (tasks: EventTask[], sessionId: string | null) => (
    <div
      className={cn(
        'gap-4',
        effectiveView === 'overview' ? 'grid items-start md:grid-cols-2 xl:grid-cols-4' : 'grid grid-cols-1'
      )}
    >
      {visibleDepartments.map((dept) => (
        <DepartmentSection
          key={`${sessionId ?? 'general'}-${dept.id}`}
          department={dept}
          tasks={tasks.filter((task) => task.department_id === dept.id)}
          canEdit={isEventsTeam}
          onAddTask={(departmentId) => openAddTask(departmentId, sessionId)}
          onOpenTask={(task) => setViewingTask(task)}
          onQuickAdd={async (departmentId, title) => {
            await createTask.mutateAsync({
              event_id: event.id,
              department_id: departmentId,
              session_id: sessionId,
              title,
              sort_order: nextSortOrder(sessionId, departmentId),
              created_by: profile?.id ?? null
            });
          }}
          onQuickAddMany={(departmentId, rows) => handleQuickAddMany(departmentId, sessionId, rows)}
          onEditTask={openEditTask}
          onDeleteTask={(task) => setDeletingTask(task)}
          onCopyTask={handleCopyTask}
          onDuplicateTask={handleDuplicateTask}
          onPasteTasks={(departmentId) => handlePasteTasks(departmentId, sessionId)}
          onNotify={(departmentId) => {
            setNotifyDeptIds([departmentId]);
            setNotifyOpen(true);
          }}
          onDropTask={async (taskId) => {
            const moving = event.event_tasks.find((task) => task.id === taskId);
            if (!moving || (moving.department_id === dept.id && (moving.session_id ?? null) === sessionId)) return;
            await updateTask.mutateAsync({ id: taskId, department_id: dept.id, session_id: sessionId });
            toast(t('common.savedSuccess'));
          }}
        />
      ))}
    </div>
  );

  const sessionHeader = (session: EventSession) => {
    const sessionTasks = event.event_tasks.filter((task) => task.session_id === session.id);
    const done = sessionTasks.filter((task) => task.status === 'completed').length;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-gradient-to-r from-navy-800 to-navy-600 px-4 py-3 text-white shadow-sm dark:from-navy-900 dark:to-navy-700">
        <Layers className="h-4 w-4 text-gold-400" />
        <span className="min-w-0 max-w-full break-words text-sm font-extrabold">
          {session.title || formatDate(session.session_date, lang, 'EEEE d MMMM')}
        </span>
        <span className="flex min-w-0 max-w-full items-center gap-1.5 text-xs text-white/80 [&>svg]:shrink-0">
          <CalendarDays className="h-3.5 w-3.5" /> {formatDate(session.session_date, lang)}
        </span>
        {session.location && (
          <span className="flex min-w-0 max-w-full items-center gap-1.5 text-xs text-white/80 [&>svg]:shrink-0">
            <MapPin className="h-3.5 w-3.5" /> <span className="min-w-0 [overflow-wrap:anywhere]">{session.location}</span>
          </span>
        )}
        {session.start_time && (
          <span className="flex min-w-0 max-w-full items-center gap-1.5 text-xs text-white/80 [&>svg]:shrink-0">
            <Clock className="h-3.5 w-3.5" /> {formatTime(session.start_time, lang)}
            {session.end_time && <> - {formatTime(session.end_time, lang)}</>}
          </span>
        )}
        {session.is_hidden && <HiddenSessionBadge tone="dark" />}
        <span className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold">
          {done}/{sessionTasks.length}
        </span>
        {isEventsTeam && (
          <div className="w-full min-w-0 sm:w-auto">
            <SessionControls
              session={session}
              sessions={sessions}
              tone="dark"
              onDuplicate={() => setSessionModal({ mode: 'duplicate', session })}
              onEdit={() => setSessionModal({ mode: 'edit', session })}
              onDelete={() => setDeletingSession(session)}
              onNotify={() => setNotifySession(session)}
              unsentCount={unsentTasks(event.event_tasks, session.id).length}
            />
          </div>
        )}
      </div>
    );
  };

  const viewModeButton = (mode: ViewMode, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={effectiveView === mode}
      onClick={() => {
        setViewMode(mode);
        try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* Storage can be blocked. */ }
      }}
      className={cn(
        'flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 sm:min-h-0 sm:flex-none sm:px-3',
        effectiveView === mode
          ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900'
          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      )}
    >
      {icon} <span className="hidden min-[400px]:inline">{label}</span>
    </button>
  );

  return (
    <div className="min-w-0 max-w-full animate-fade-in space-y-5">
      {/* Keep the event header in the flow on phones */}
      <div
        className="border-b border-slate-200 px-0 py-3 dark:border-slate-800 md:sticky md:top-16 md:z-10 md:-mx-4 md:bg-white/90 md:px-4 md:backdrop-blur md:dark:bg-slate-950/90 lg:-mx-8 lg:px-8"
        style={{ borderTop: `4px solid ${event.header_color || '#1a3c5e'}` }}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 lg:flex lg:flex-wrap">
          <Link to={isArchived ? '/archive' : '/events'} className="no-print">
            <Button variant="ghost" size="sm" className="min-h-10 md:min-h-0" aria-label={t('common.back')}><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="contents lg:block lg:min-w-0 lg:flex-1">
            <h1 title={event.name} className="min-w-0 line-clamp-2 break-words text-lg font-bold text-navy-800 dark:text-white sm:text-xl md:line-clamp-1">{event.name}</h1>
            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 [&>svg]:shrink-0">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDateRange(event.event_date, event.end_date, lang)}
              </span>
              {event.location && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 [&>svg]:shrink-0">
                  <MapPin className="h-3.5 w-3.5" /> <span className="min-w-0 [overflow-wrap:anywhere]">{event.location}</span>
                </span>
              )}
              {event.event_start && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 [&>svg]:shrink-0">
                  <Clock className="h-3.5 w-3.5" /> {formatTime(event.event_start, lang)}
                  {event.event_finish && <> - {formatTime(event.event_finish, lang)}</>}
                </span>
              )}
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {t(`categories.${event.category}` as never)}
              </Badge>
              <span className="lg:hidden"><EventStatusBadge status={event.status} /></span>
            </div>
            {/* Who to ask, right under the name of the thing being asked about */}
            <EventContacts contacts={event.contacts} className="col-span-2 min-w-0 lg:mt-1.5" />
          </div>
          <div className="hidden items-center gap-1.5 lg:flex">
            <EventStatusBadge status={event.status} />
          </div>
          {isEventsTeam && (
            <div className="no-print col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 [&_button]:min-h-10 lg:[&_button]:min-h-0">
              <Button variant="gold" size="sm" onClick={() => { setNotifyDeptIds(null); setNotifyOpen(true); }}>
                <Bell className="h-4 w-4" /> <span>{t('events.notify')}</span>
              </Button>
              <Link to={`/events/${event.id}/edit`}>
                <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> <span>{t('common.edit')}</span></Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)} title={t('events.saveAsTemplate')}>
                <LayoutTemplate className="h-4 w-4" />
              </Button>
              {canArchive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                  loading={archiveEvents.isPending}
                  title={t('archive.archive')}
                  aria-label={t('archive.archive')}
                >
                  {!archiveEvents.isPending && <Archive className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={() => setConfirmDelete(true)}
                title={t('events.deleteEvent')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {isArchived && (
        <ArchivedBanner kind="event" canRestore={isEventsTeam} restoring={restoreEvents.isPending} onRestore={handleRestore} />
      )}

      {/* Department tasks header: view mode, add session, copy sessions */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto w-full text-lg font-bold text-navy-800 dark:text-white sm:w-auto">{t('events.departmentTasks')}</h2>
        {isEventsTeam && (
          <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" size="sm" onClick={() => setSessionModal({ mode: 'create', session: null })}>
              <Plus className="h-4 w-4" /> {t('sessions.addSession')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} title={t('sessions.importTitle')}>
              <Import className="h-4 w-4" /> <span>{t('sessions.copyFromEvent')}</span>
            </Button>
          </div>
        )}
        <div className="flex w-full min-w-0 rounded-xl border border-slate-200 bg-white p-1 sm:w-auto dark:border-slate-700 dark:bg-slate-900">
          {viewModeButton('grid', <Table2 className="h-3.5 w-3.5" />, t('events.viewModeGrid'))}
          {viewModeButton('overview', <LayoutGrid className="h-3.5 w-3.5" />, t('events.viewModeOverview'))}
          {viewModeButton('department', <Eye className="h-3.5 w-3.5" />, t('events.viewModeDepartment'))}
        </div>
        {effectiveView === 'department' && (
          <select
            value={selectedDeptId || profile?.department_id || sortedDepartments[0]?.id || ''}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            aria-label={t('common.department')}
            className="w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto dark:border-slate-700 dark:bg-slate-900"
          >
            {sortedDepartments.map((d) => (
              <option key={d.id} value={d.id}>{deptName(d)}</option>
            ))}
          </select>
        )}
      </div>

      {isEventsTeam && <EventCheckStrip key={event.id} event={event} departments={sortedDepartments} />}

      {/* Tasks: one spreadsheet, or cards grouped by session */}
      {effectiveView === 'grid' ? (
        <TaskGrid
          eventId={event.id}
          eventDate={event.event_date}
          tasks={event.event_tasks}
          departments={sortedDepartments}
          sessions={sessions}
          canEdit={isEventsTeam}
          onOpenTask={(task) => setViewingTask(task)}
          onEditTask={openEditTask}
          onAddSession={() => setSessionModal({ mode: 'create', session: null })}
          renderSessionTools={(session) => (
            <SessionControls
              session={session}
              sessions={sessions}
              tone="light"
              onDuplicate={() => setSessionModal({ mode: 'duplicate', session })}
              onEdit={() => setSessionModal({ mode: 'edit', session })}
              onDelete={() => setDeletingSession(session)}
              onNotify={() => setNotifySession(session)}
              unsentCount={unsentTasks(event.event_tasks, session.id).length}
            />
          )}
        />
      ) : sessions.length === 0 ? (
        renderDepartmentGrid(event.event_tasks, null)
      ) : (
        <div className="space-y-6">
          {generalTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-2xl bg-slate-200/70 px-4 py-2.5 dark:bg-slate-800">
                <Layers className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-extrabold text-slate-600 dark:text-slate-300">{t('sessions.generalTasks')}</span>
              </div>
              {renderDepartmentGrid(generalTasks, null)}
            </div>
          )}
          {sessions.map((session) => (
            <div key={session.id} className="space-y-3">
              {sessionHeader(session)}
              {renderDepartmentGrid(event.event_tasks.filter((task) => task.session_id === session.id), session.id)}
            </div>
          ))}
        </div>
      )}

      {/* Sessions are managed from the grid view too */}
      {effectiveView === 'grid' && sessions.length > 0 && isEventsTeam && (
        <div className="flex flex-wrap gap-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 text-xs dark:bg-slate-900',
                session.is_hidden
                  ? 'border-amber-300 dark:border-amber-700'
                  : 'border-slate-200 dark:border-slate-700'
              )}
              style={{ borderLeft: `4px solid ${sessionColor(sessions, session.id)}` }}
            >
              <Layers className="h-3.5 w-3.5" style={{ color: sessionColor(sessions, session.id) }} />
              <span className="min-w-0 max-w-full [overflow-wrap:anywhere] font-semibold text-slate-700 dark:text-slate-200">
                {session.title || formatDate(session.session_date, lang, 'd MMM')}
              </span>
              {session.is_hidden && <HiddenSessionBadge tone="light" />}
              <SessionControls
                session={session}
                sessions={sessions}
                tone="light"
                onDuplicate={() => setSessionModal({ mode: 'duplicate', session })}
                onEdit={() => setSessionModal({ mode: 'edit', session })}
                onDelete={() => setDeletingSession(session)}
                onNotify={() => setNotifySession(session)}
                unsentCount={unsentTasks(event.event_tasks, session.id).length}
              />
            </div>
          ))}
          <p className="basis-full text-xs text-slate-400">{t('sessions.reorderHint')}</p>
        </div>
      )}

      <section className="space-y-4">
        <button
          type="button"
          aria-expanded={showDetails}
          aria-controls="event-details"
          onClick={() => setDetailsOpen(!showDetails)}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left dark:border-slate-700 dark:bg-slate-900"
        >
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', showDetails && 'rotate-180')} />
          <span className="shrink-0 font-bold text-navy-800 dark:text-white">{lang === 'th' ? 'รายละเอียดกิจกรรม' : 'Event details'}</span>
          <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
            {[formatDateRange(event.event_date, event.end_date, lang), event.location, `${attachments?.length ?? 0} ${t('common.attachments')}`].filter(Boolean).join(' · ')}
          </span>
        </button>
        <div id="event-details" hidden={!showDetails} className="space-y-5">
          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle>{t('events.timeline')}</CardTitle></CardHeader>
            <CardBody><EventTimeline event={event} /></CardBody>
          </Card>

          {/* Event information */}
          {(!isRichTextEmpty(event.description) || !isRichTextEmpty(event.additional_notes) ||
            (isEventsTeam && !isRichTextEmpty(event.internal_notes))) && (
            <Card>
              <CardHeader><CardTitle>{t('events.eventInfo')}</CardTitle></CardHeader>
              <CardBody className="space-y-4">
                {!isRichTextEmpty(event.description) && (
                  <section>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('events.descriptionLabel')}</h4>
                    <RichTextViewer html={event.description} />
                  </section>
                )}
                {!isRichTextEmpty(event.additional_notes) && (
                  <section>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('events.additionalNotes')}</h4>
                    <RichTextViewer html={event.additional_notes} />
                  </section>
                )}
                {isEventsTeam && !isRichTextEmpty(event.internal_notes) && (
                  <section className="rounded-xl border border-gold-200 bg-gold-50 p-3 dark:border-gold-900 dark:bg-gold-950/30">
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-400">
                      {t('events.internalNotes')} ({t('events.internalOnly')})
                    </h4>
                    <RichTextViewer html={event.internal_notes} />
                  </section>
                )}
              </CardBody>
            </Card>
          )}

          {/* Attachments */}
          <Card>
            <CardHeader><CardTitle>{t('common.attachments')}</CardTitle></CardHeader>
            <CardBody>
              <AttachmentSection entityType="event" entityId={event.id} canManage={isEventsTeam} />
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Audit history */}
      {isEventsTeam && <AuditHistory recordId={event.id} />}

      {/* Modals */}
      <TaskFormModal
        open={taskFormOpen}
        onClose={() => { setTaskFormOpen(false); setEditingTask(null); }}
        eventId={event.id}
        eventDate={event.event_date}
        departments={sortedDepartments}
        sessions={sessions}
        defaultDepartmentId={taskFormDeptId}
        defaultSessionId={taskFormSessionId}
        task={editingTask}
        eventNotes={event.additional_notes}
        onSaveEventNotes={async (html) => {
          await updateEvent.mutateAsync({ id: event.id, additional_notes: html });
        }}
      />
      <TaskDetailModal
        open={!!viewingTask}
        onClose={() => setViewingTask(null)}
        task={viewingTask ? event.event_tasks.find((task) => task.id === viewingTask.id) ?? viewingTask : null}
        department={sortedDepartments.find((d) => d.id === viewingTask?.department_id)}
        eventId={event.id}
        onEdit={openEditTask}
      />
      {notifySession && (
        <SessionNotifyModal
          open
          onClose={() => setNotifySession(null)}
          session={notifySession}
          eventName={event.name}
          tasks={event.event_tasks}
          departments={sortedDepartments}
        />
      )}
      {sessionModal && (
        <SessionFormModal
          open
          onClose={() => setSessionModal(null)}
          eventId={event.id}
          eventDate={event.event_date}
          session={sessionModal.mode === 'edit' ? sessionModal.session : null}
          duplicateFrom={sessionModal.mode === 'duplicate' ? sessionModal.session : null}
          sourceTasks={
            sessionModal.mode === 'duplicate' && sessionModal.session
              ? event.event_tasks.filter((task) => task.session_id === sessionModal.session?.id)
              : []
          }
          sessions={sessions}
        />
      )}
      {importOpen && (
        <SessionImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          eventId={event.id}
          eventDate={event.event_date}
          sessions={sessions}
        />
      )}
      {notifyOpen && (
        <NotifyModal
          open={notifyOpen}
          onClose={() => { setNotifyOpen(false); setNotifyDeptIds(null); }}
          type="event"
          targetId={event.id}
          departments={sortedDepartments}
          suggestedIds={notifyDeptIds ?? departmentsWithTasks.map((d) => d.id)}
        />
      )}
      {templateOpen && (
        <SaveTemplateModal
          open={templateOpen}
          onClose={() => setTemplateOpen(false)}
          event={event}
          departments={sortedDepartments}
          attachments={attachments ?? []}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={t('events.deleteConfirm')}
        message={t('events.deleteConfirmText')}
        loading={deleteEvent.isPending}
      />
      <ConfirmDialog
        open={!!deletingTask}
        onClose={() => setDeletingTask(null)}
        onConfirm={async () => {
          if (deletingTask) {
            await deleteTask.mutateAsync(deletingTask.id);
            setDeletingTask(null);
            toast(t('common.deletedSuccess'));
          }
        }}
        title={t('tasks.deleteTaskConfirm')}
        loading={deleteTask.isPending}
      />
      <ConfirmDialog
        open={!!deletingSession}
        onClose={() => setDeletingSession(null)}
        onConfirm={async () => {
          if (deletingSession) {
            await deleteSession.mutateAsync(deletingSession.id);
            setDeletingSession(null);
            toast(t('common.deletedSuccess'));
          }
        }}
        title={t('sessions.deleteConfirm')}
        loading={deleteSession.isPending}
      />
    </div>
  );
}
