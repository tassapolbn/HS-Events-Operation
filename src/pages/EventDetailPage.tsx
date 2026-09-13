import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Bell, CalendarDays, Clock, CopyPlus, Import, LayoutTemplate, Layers, MapPin, Pencil, Plus,
  Table2, Trash2, Eye, LayoutGrid
} from 'lucide-react';
import { useEvent, useEventMutations } from '../hooks/useEvents';
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
import { SessionImportModal } from '../components/events/SessionImportModal';
import { AuditHistory } from '../components/events/AuditHistory';
import { AttachmentSection } from '../components/attachments/AttachmentSection';
import { cn, combineDateTime, formatDate, formatTime, isRichTextEmpty } from '../lib/utils';
import { normalizeTimeInput } from '../lib/grid';
import { copyTasks, getTaskClipboard, taskToClipboardItem } from '../lib/taskClipboard';
import type { EventSession, EventTask } from '../types';

type ViewMode = 'grid' | 'overview' | 'department';

const VIEW_MODE_KEY = 'eventops.eventViewMode';

function readViewMode(fallback: ViewMode): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'overview' || saved === 'department') return saved;
  } catch {
    // Storage can be blocked; the default is fine
  }
  return fallback;
}

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { isEventsTeam, profile } = useAuth();

  const { data: event, isLoading, error } = useEvent(id);
  const { data: departments } = useDepartments();
  const { data: attachments } = useAttachments('event', id);
  const { deleteEvent, updateEvent } = useEventMutations();
  const { createTask, createTasks, updateTask, deleteTask } = useTaskMutations(id);
  const { deleteSession } = useSessionMutations(id ?? '');

  const [viewMode, setViewMode] = useState<ViewMode>(() => readViewMode(isEventsTeam ? 'grid' : 'overview'));
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskFormDeptId, setTaskFormDeptId] = useState<string | undefined>();
  const [taskFormSessionId, setTaskFormSessionId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<EventTask | null>(null);
  const [viewingTask, setViewingTask] = useState<EventTask | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sessionModal, setSessionModal] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    session: EventSession | null;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingSession, setDeletingSession] = useState<EventSession | null>(null);
  const [deletingTask, setDeletingTask] = useState<EventTask | null>(null);
  const [notifyDeptIds, setNotifyDeptIds] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const sortedDepartments = departments ?? [];

  const visibleDepartments = useMemo(() => {
    if (viewMode === 'department') {
      const targetId = selectedDeptId || profile?.department_id || sortedDepartments[0]?.id;
      return sortedDepartments.filter((d) => d.id === targetId);
    }
    return sortedDepartments;
  }, [viewMode, selectedDeptId, sortedDepartments, profile?.department_id]);

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
        viewMode === 'overview' ? 'grid items-start md:grid-cols-2 xl:grid-cols-4' : 'grid grid-cols-1'
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-gradient-to-r from-navy-800 to-navy-600 px-4 py-3 text-white shadow-sm dark:from-navy-900 dark:to-navy-700">
        <Layers className="h-4 w-4 text-gold-400" />
        <span className="text-sm font-extrabold">
          {session.title || formatDate(session.session_date, lang, 'EEEE d MMMM')}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-white/80">
          <CalendarDays className="h-3.5 w-3.5" /> {formatDate(session.session_date, lang)}
        </span>
        {session.location && (
          <span className="flex items-center gap-1.5 text-xs text-white/80">
            <MapPin className="h-3.5 w-3.5" /> {session.location}
          </span>
        )}
        {session.start_time && (
          <span className="flex items-center gap-1.5 text-xs text-white/80">
            <Clock className="h-3.5 w-3.5" /> {formatTime(session.start_time, lang)}
            {session.end_time && <> - {formatTime(session.end_time, lang)}</>}
          </span>
        )}
        <span className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold">
          {done}/{sessionTasks.length}
        </span>
        {isEventsTeam && (
          <span className="flex items-center gap-0.5">
            <button
              onClick={() => setSessionModal({ mode: 'duplicate', session })}
              className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              title={t('sessions.duplicateSession')}
            >
              <CopyPlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSessionModal({ mode: 'edit', session })}
              className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              title={t('sessions.editSession')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeletingSession(session)}
              className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-red-500/40 hover:text-white"
              title={t('sessions.deleteSession')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
    );
  };

  const viewModeButton = (mode: ViewMode, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setViewMode(mode)}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
        viewMode === mode
          ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900'
          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="animate-fade-in space-y-5">
      {/* Sticky event header */}
      <div
        className="sticky top-16 z-10 -mx-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:-mx-8 lg:px-8"
        style={{ borderTop: `4px solid ${event.header_color || '#1a3c5e'}` }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
          <Link to="/events" className="no-print">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-navy-800 dark:text-white sm:text-xl">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(event.event_date, lang)}
              </span>
              {event.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {event.location}
                </span>
              )}
              {event.event_start && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {formatTime(event.event_start, lang)}
                  {event.event_finish && <> - {formatTime(event.event_finish, lang)}</>}
                </span>
              )}
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {t(`categories.${event.category}` as never)}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <EventStatusBadge status={event.status} />
          </div>
          {isEventsTeam && (
            <div className="no-print flex items-center gap-1.5">
              <Button variant="gold" size="sm" onClick={() => { setNotifyDeptIds(null); setNotifyOpen(true); }}>
                <Bell className="h-4 w-4" /> <span className="hidden sm:inline">{t('events.notify')}</span>
              </Button>
              <Link to={`/events/${event.id}/edit`}>
                <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> <span className="hidden sm:inline">{t('common.edit')}</span></Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)} title={t('events.saveAsTemplate')}>
                <LayoutTemplate className="h-4 w-4" />
              </Button>
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

      {/* Department tasks header: view mode, add session, copy sessions */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold text-navy-800 dark:text-white">{t('events.departmentTasks')}</h2>
        {isEventsTeam && (
          <>
            <Button variant="outline" size="sm" onClick={() => setSessionModal({ mode: 'create', session: null })}>
              <Plus className="h-4 w-4" /> {t('sessions.addSession')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} title={t('sessions.importTitle')}>
              <Import className="h-4 w-4" /> <span className="hidden sm:inline">{t('sessions.copyFromEvent')}</span>
            </Button>
          </>
        )}
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {viewModeButton('grid', <Table2 className="h-3.5 w-3.5" />, t('events.viewModeGrid'))}
          {viewModeButton('overview', <LayoutGrid className="h-3.5 w-3.5" />, t('events.viewModeOverview'))}
          {viewModeButton('department', <Eye className="h-3.5 w-3.5" />, t('events.viewModeDepartment'))}
        </div>
        {viewMode === 'department' && (
          <select
            value={selectedDeptId || profile?.department_id || sortedDepartments[0]?.id || ''}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {sortedDepartments.map((d) => (
              <option key={d.id} value={d.id}>{deptName(d)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tasks: one spreadsheet, or cards grouped by session */}
      {viewMode === 'grid' ? (
        <TaskGrid
          eventId={event.id}
          eventDate={event.event_date}
          tasks={event.event_tasks}
          departments={sortedDepartments}
          sessions={sessions}
          canEdit={isEventsTeam}
          onOpenTask={(task) => setViewingTask(task)}
          onEditTask={openEditTask}
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
      {viewMode === 'grid' && sessions.length > 0 && isEventsTeam && (
        <div className="flex flex-wrap gap-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {session.title || formatDate(session.session_date, lang, 'd MMM')}
              </span>
              <button
                onClick={() => setSessionModal({ mode: 'duplicate', session })}
                title={t('sessions.duplicateSession')}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
              >
                <CopyPlus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setSessionModal({ mode: 'edit', session })}
                title={t('sessions.editSession')}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDeletingSession(session)}
                title={t('sessions.deleteSession')}
                className="rounded-md p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

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
          nextSortOrder={sessions.length}
        />
      )}
      {importOpen && (
        <SessionImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          eventId={event.id}
          eventDate={event.event_date}
          nextSortOrder={sessions.length}
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
