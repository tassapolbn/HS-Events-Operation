import { useState } from 'react';
import { MapPin, Clock, User, Pencil, Trash2, Plus, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { PriorityBadge, TaskStatusBadge } from '../ui/Badge';
import { RichTextViewer } from '../editor/RichTextViewer';
import { RichTextEditor } from '../editor/RichTextEditor';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { AttachmentSection } from '../attachments/AttachmentSection';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { useChecklist, useChecklistMutations, useTaskMutations } from '../../hooks/useTasks';
import { TASK_STATUSES } from '../../lib/constants';
import { cn, formatTime, isRichTextEmpty } from '../../lib/utils';
import type { Department, EventTask, TaskStatus } from '../../types';

interface TaskDetailModalProps {
  open: boolean;
  onClose: () => void;
  task: EventTask | null;
  department: Department | undefined;
  eventId: string;
  onEdit: (task: EventTask) => void;
}

export function TaskDetailModal({ open, onClose, task, department, eventId, onEdit }: TaskDetailModalProps) {
  const { t, deptName, lang } = useLanguage();
  const { profile, isEventsTeam } = useAuth();
  const { toast } = useToast();
  const { updateTask, deleteTask } = useTaskMutations(eventId);
  const { data: checklist } = useChecklist(task?.id);
  const { addItem, toggleItem, removeItem } = useChecklistMutations(task?.id);

  const [newItem, setNewItem] = useState('');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!task) return null;

  const canUpdate = isEventsTeam || (!!profile?.department_id && profile.department_id === task.department_id);

  const changeStatus = async (status: TaskStatus) => {
    try {
      await updateTask.mutateAsync({ id: task.id, status });
      toast(t('common.savedSuccess'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const saveNotes = async () => {
    if (notesDraft === null) return;
    try {
      await updateTask.mutateAsync({ id: task.id, notes: notesDraft });
      setNotesDraft(null);
      toast(t('common.savedSuccess'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const addChecklistItem = async () => {
    const label = newItem.trim();
    if (!label) return;
    await addItem.mutateAsync({ label, sortOrder: (checklist?.length ?? 0) + 1 });
    setNewItem('');
  };

  const infoRow = (icon: React.ReactNode, label: string, value: string) =>
    value ? (
      <div className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 text-slate-400">{icon}</span>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="font-medium text-slate-700 dark:text-slate-200">{value}</p>
        </div>
      </div>
    ) : null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={task.title}
        subtitle={deptName(department)}
        size="lg"
        footer={
          isEventsTeam ? (
            <>
              <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> {t('tasks.deleteTask')}
              </Button>
              <Button variant="outline" onClick={() => onEdit(task)}>
                <Pencil className="h-4 w-4" /> {t('common.edit')}
              </Button>
              <Button onClick={onClose}>{t('common.close')}</Button>
            </>
          ) : (
            <Button onClick={onClose}>{t('common.close')}</Button>
          )
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <TaskStatusBadge status={task.status} />
            {canUpdate && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-400">{t('myDept.updateStatus')}:</span>
                <Select
                  value={task.status}
                  onChange={(e) => changeStatus(e.target.value as TaskStatus)}
                  className="w-40"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 sm:grid-cols-2">
            {infoRow(<MapPin className="h-4 w-4" />, t('tasks.workLocation'), task.work_location)}
            {infoRow(<MapPin className="h-4 w-4" />, t('tasks.setupLocation'), task.setup_location)}
            {infoRow(<User className="h-4 w-4" />, t('tasks.assignedStaff'), task.assigned_staff)}
            {infoRow(
              <Clock className="h-4 w-4" />,
              `${t('tasks.startTime')} - ${t('tasks.completionTime')}`,
              task.start_time || task.completion_time
                ? `${formatTime(task.start_time, lang)} - ${formatTime(task.completion_time, lang)}`
                : ''
            )}
          </div>

          {!isRichTextEmpty(task.description) && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tasks.taskDescription')}</h4>
              <RichTextViewer html={task.description} />
            </section>
          )}

          {!isRichTextEmpty(task.instructions) && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tasks.instructions')}</h4>
              <RichTextViewer html={task.instructions} />
            </section>
          )}

          {/* Checklist */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('tasks.checklist')}
              {checklist && checklist.length > 0 && (
                <span className="ml-2 font-normal normal-case text-slate-400">
                  {checklist.filter((c) => c.is_done).length}/{checklist.length}
                </span>
              )}
            </h4>
            <ul className="space-y-1.5">
              {(checklist ?? []).map((item) => (
                <li key={item.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={item.is_done}
                    disabled={!canUpdate}
                    onChange={(e) =>
                      profile && toggleItem.mutate({ id: item.id, isDone: e.target.checked, userId: profile.id })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-navy-700 accent-navy-700 dark:accent-gold-400"
                  />
                  <span className={cn('flex-1 text-sm', item.is_done && 'text-slate-400 line-through')}>{item.label}</span>
                  {canUpdate && (
                    <button
                      onClick={() => removeItem.mutate(item.id)}
                      className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      aria-label={t('common.remove')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canUpdate && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                  placeholder={t('tasks.addChecklistItem')}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                />
                <Button size="sm" variant="outline" onClick={addChecklistItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </section>

          {/* Department notes */}
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('tasks.departmentNotes')}
            </h4>
            {canUpdate ? (
              <div className="space-y-2">
                <RichTextEditor
                  value={notesDraft ?? task.notes}
                  onChange={(html) => setNotesDraft(html)}
                  placeholder={t('tasks.notesHint')}
                />
                {notesDraft !== null && notesDraft !== task.notes && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setNotesDraft(null)}>{t('common.cancel')}</Button>
                    <Button size="sm" onClick={saveNotes} loading={updateTask.isPending}>{t('common.save')}</Button>
                  </div>
                )}
              </div>
            ) : (
              <RichTextViewer html={task.notes} emptyText={t('attachments.noFiles')} />
            )}
          </section>

          {/* Attachments */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('common.attachments')}</h4>
            <AttachmentSection entityType="event_task" entityId={task.id} canManage={isEventsTeam} compact />
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteTask.mutateAsync(task.id);
          setConfirmDelete(false);
          onClose();
        }}
        title={t('tasks.deleteTaskConfirm')}
        loading={deleteTask.isPending}
      />
    </>
  );
}
