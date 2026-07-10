import { useState } from 'react';
import { Bell, ChevronDown, Clock, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { departmentIcon, TASK_STATUS_DOTS } from '../../lib/constants';
import { useLanguage } from '../../i18n';
import { cn, formatTime } from '../../lib/utils';
import type { Department, EventTask } from '../../types';

interface DepartmentSectionProps {
  department: Department;
  tasks: EventTask[];
  canEdit: boolean;
  /** Opens the full task form (details, instructions, times, attachments) */
  onAddTask: (departmentId: string) => void;
  onOpenTask: (task: EventTask) => void;
  /** Creates a task instantly from a single line of text */
  onQuickAdd: (departmentId: string, title: string) => Promise<void>;
  /** Quick actions on a task row */
  onEditTask: (task: EventTask) => void;
  onDeleteTask: (task: EventTask) => void;
  /** Notify only this department */
  onNotify: (departmentId: string) => void;
  /** A task was dropped onto this section (move it here) */
  onDropTask: (taskId: string) => void;
}

export function DepartmentSection({
  department, tasks, canEdit, onAddTask, onOpenTask, onQuickAdd, onEditTask, onDeleteTask, onNotify, onDropTask
}: DepartmentSectionProps) {
  const { t, deptName, lang } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const Icon = departmentIcon(department.icon);

  const done = tasks.filter((task) => task.status === 'completed').length;
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  const submitQuickAdd = async () => {
    const title = quickTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await onQuickAdd(department.id, title);
      setQuickTitle('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <section
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(false);
        const taskId = e.dataTransfer.getData('text/task-id');
        if (taskId) onDropTask(taskId);
      }}
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all dark:bg-slate-900',
        dragOver
          ? 'border-gold-400 ring-2 ring-gold-300/60'
          : 'border-slate-200 dark:border-slate-800'
      )}
      style={{ borderTopWidth: 4, borderTopColor: department.color }}
      title={canEdit ? t('tasks.dragHint') : undefined}
    >
      <header className="flex select-none items-center gap-2 px-3 py-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${department.color}1c`, color: department.color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setCollapsed((v) => !v)}>
          <h3 className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{deptName(department)}</h3>
          <div className="mt-0.5 flex items-center gap-1.5">
            <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: department.color }} />
            </div>
            <span className="text-[11px] text-slate-400">{done}/{tasks.length}</span>
          </div>
        </div>
        {canEdit && (
          <>
            <button
              onClick={() => onNotify(department.id)}
              title={t('events.notify')}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-gold-50 hover:text-gold-600 dark:hover:bg-gold-950/40"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              onClick={() => onAddTask(department.id)}
              title={t('tasks.detailedTask')}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <ListPlus className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-lg p-1 text-slate-400"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed && '-rotate-90')} />
        </button>
      </header>

      {!collapsed && (
        <div className="flex flex-1 flex-col border-t border-slate-100 dark:border-slate-800">
          {tasks.length === 0 ? (
            <p className="px-3 py-4 text-xs italic text-slate-400">{t('events.noTasksDept')}</p>
          ) : (
            <ol className="flex-1 divide-y divide-slate-50 dark:divide-slate-800/60">
              {tasks.map((task, index) => (
                <li
                  key={task.id}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/task-id', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => onOpenTask(task)}
                  className={cn(
                    'group flex cursor-pointer items-start gap-2 px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    canEdit && 'active:cursor-grabbing'
                  )}
                >
                  <span className="w-4 shrink-0 pt-px text-right text-xs font-bold text-slate-300 dark:text-slate-600">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-[13px] leading-snug text-slate-700 dark:text-slate-200',
                        (task.status === 'completed' || task.status === 'cancelled') &&
                          'text-slate-400 line-through dark:text-slate-500'
                      )}
                    >
                      {task.title}
                    </span>
                    {(task.start_time || task.assigned_staff) && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                        {task.start_time && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> {formatTime(task.start_time, lang)}
                          </span>
                        )}
                        {task.assigned_staff && <span>{task.assigned_staff}</span>}
                      </span>
                    )}
                  </span>
                  {(task.priority === 'high' || task.priority === 'urgent') && (
                    <span
                      className={cn(
                        'mt-0.5 shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold uppercase',
                        task.priority === 'urgent'
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300'
                          : 'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-300'
                      )}
                    >
                      {t(`priority.${task.priority}`)}
                    </span>
                  )}
                  {canEdit && (
                    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditTask(task);
                        }}
                        title={t('common.edit')}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-navy-700 dark:hover:bg-slate-700 dark:hover:text-gold-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTask(task);
                        }}
                        title={t('common.delete')}
                        className="rounded-md p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TASK_STATUS_DOTS[task.status] }}
                    title={t(`taskStatus.${task.status}`)}
                  />
                </li>
              ))}
            </ol>
          )}

          {canEdit && (
            <div className="flex items-center gap-1.5 border-t border-slate-100 p-2 dark:border-slate-800">
              <input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitQuickAdd();
                  }
                }}
                placeholder={t('tasks.quickAddPlaceholder')}
                disabled={adding}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] placeholder:text-slate-400 focus:border-navy-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:focus:border-gold-400 dark:focus:bg-slate-900"
              />
              <button
                onClick={submitQuickAdd}
                disabled={adding || !quickTitle.trim()}
                className="rounded-lg p-1.5 text-white transition-all hover:scale-105 disabled:opacity-40"
                style={{ backgroundColor: department.color }}
                aria-label={t('common.add')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
