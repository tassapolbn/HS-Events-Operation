import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Bell, CalendarDays, LayoutTemplate, MapPin, Pencil, Trash2, Eye, LayoutGrid
} from 'lucide-react';
import { useEvent, useEventMutations } from '../hooks/useEvents';
import { useDepartments } from '../hooks/useDepartments';
import { useAttachments } from '../hooks/useAttachments';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EventStatusBadge, PriorityBadge, Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { RichTextViewer } from '../components/editor/RichTextViewer';
import { EventTimeline } from '../components/events/EventTimeline';
import { DepartmentSection } from '../components/events/DepartmentSection';
import { TaskFormModal } from '../components/events/TaskFormModal';
import { TaskDetailModal } from '../components/events/TaskDetailModal';
import { NotifyModal } from '../components/events/NotifyModal';
import { SaveTemplateModal } from '../components/events/SaveTemplateModal';
import { AuditHistory } from '../components/events/AuditHistory';
import { AttachmentSection } from '../components/attachments/AttachmentSection';
import { cn, formatDate, isRichTextEmpty } from '../lib/utils';
import type { EventTask } from '../types';

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { isEventsTeam, profile } = useAuth();

  const { data: event, isLoading, error } = useEvent(id);
  const { data: departments } = useDepartments();
  const { data: attachments } = useAttachments('event', id);
  const { deleteEvent } = useEventMutations();

  const [viewMode, setViewMode] = useState<'overview' | 'department'>('overview');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskFormDeptId, setTaskFormDeptId] = useState<string | undefined>();
  const [editingTask, setEditingTask] = useState<EventTask | null>(null);
  const [viewingTask, setViewingTask] = useState<EventTask | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const departmentsWithTasks = sortedDepartments.filter((d) =>
    event.event_tasks.some((task) => task.department_id === d.id)
  );

  const openAddTask = (departmentId: string) => {
    setEditingTask(null);
    setTaskFormDeptId(departmentId);
    setTaskFormOpen(true);
  };

  const openEditTask = (task: EventTask) => {
    setViewingTask(null);
    setEditingTask(task);
    setTaskFormDeptId(task.department_id);
    setTaskFormOpen(true);
  };

  const handleDelete = async () => {
    await deleteEvent.mutateAsync(event.id);
    toast(t('common.deletedSuccess'));
    navigate('/events');
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* Sticky event header */}
      <div className="sticky top-16 z-10 -mx-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:-mx-8 lg:px-8">
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
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {t(`categories.${event.category}` as never)}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <PriorityBadge priority={event.priority} />
            <EventStatusBadge status={event.status} />
          </div>
          {isEventsTeam && (
            <div className="no-print flex items-center gap-1.5">
              <Button variant="gold" size="sm" onClick={() => setNotifyOpen(true)}>
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

      {/* View mode toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold text-navy-800 dark:text-white">{t('events.departmentTasks')}</h2>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          <button
            onClick={() => setViewMode('overview')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'overview' ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> {t('events.viewModeOverview')}
          </button>
          <button
            onClick={() => setViewMode('department')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'department' ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            <Eye className="h-3.5 w-3.5" /> {t('events.viewModeDepartment')}
          </button>
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

      {/* Department sections: every department on one screen */}
      <div className="space-y-4">
        {visibleDepartments.map((dept) => (
          <DepartmentSection
            key={dept.id}
            department={dept}
            tasks={event.event_tasks.filter((task) => task.department_id === dept.id)}
            canEdit={isEventsTeam}
            onAddTask={openAddTask}
            onOpenTask={(task) => setViewingTask(task)}
          />
        ))}
      </div>

      {/* Audit history */}
      {isEventsTeam && <AuditHistory recordId={event.id} />}

      {/* Modals */}
      <TaskFormModal
        open={taskFormOpen}
        onClose={() => { setTaskFormOpen(false); setEditingTask(null); }}
        eventId={event.id}
        eventDate={event.event_date}
        departments={sortedDepartments}
        defaultDepartmentId={taskFormDeptId}
        task={editingTask}
      />
      <TaskDetailModal
        open={!!viewingTask}
        onClose={() => setViewingTask(null)}
        task={viewingTask ? event.event_tasks.find((task) => task.id === viewingTask.id) ?? viewingTask : null}
        department={sortedDepartments.find((d) => d.id === viewingTask?.department_id)}
        eventId={event.id}
        onEdit={openEditTask}
      />
      {notifyOpen && (
        <NotifyModal
          open={notifyOpen}
          onClose={() => setNotifyOpen(false)}
          type="event"
          targetId={event.id}
          departments={sortedDepartments}
          suggestedIds={departmentsWithTasks.map((d) => d.id)}
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
    </div>
  );
}
