import { useState } from 'react';
import { ChevronDown, Plus, MapPin, Clock, User } from 'lucide-react';
import { departmentIcon } from '../../lib/constants';
import { useLanguage } from '../../i18n';
import { cn, formatTime, isRichTextEmpty } from '../../lib/utils';
import { PriorityBadge, TaskStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { RichTextViewer } from '../editor/RichTextViewer';
import type { Department, EventTask } from '../../types';

interface DepartmentSectionProps {
  department: Department;
  tasks: EventTask[];
  canEdit: boolean;
  onAddTask: (departmentId: string) => void;
  onOpenTask: (task: EventTask) => void;
}

export function DepartmentSection({ department, tasks, canEdit, onAddTask, onOpenTask }: DepartmentSectionProps) {
  const { t, deptName, lang } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const Icon = departmentIcon(department.icon);

  const done = tasks.filter((task) => task.status === 'completed').length;
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      style={{ borderLeftWidth: 4, borderLeftColor: department.color }}
    >
      <header
        className="flex cursor-pointer select-none items-center gap-3 px-4 py-3.5 sm:px-5"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: department.color }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{deptName(department)}</h3>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: department.color }}
              />
            </div>
            <span className="text-xs text-slate-400">
              {done}/{tasks.length}
            </span>
          </div>
        </div>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(department.id);
            }}
          >
            <Plus className="h-4 w-4" /> {t('events.addTaskFor')}
          </Button>
        )}
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', collapsed && '-rotate-90')} />
      </header>

      {!collapsed && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {tasks.length === 0 ? (
            <p className="px-5 py-5 text-sm italic text-slate-400">{t('events.noTasksDept')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  onClick={() => onOpenTask(task)}
                  className="cursor-pointer px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{task.title}</p>
                    <PriorityBadge priority={task.priority} />
                    <TaskStatusBadge status={task.status} />
                  </div>
                  {!isRichTextEmpty(task.description) && (
                    <RichTextViewer html={task.description} className="mt-1 line-clamp-2 text-xs text-slate-500" />
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    {(task.work_location || task.setup_location) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {task.work_location || task.setup_location}
                      </span>
                    )}
                    {task.start_time && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(task.start_time, lang)}
                        {task.completion_time && <> - {formatTime(task.completion_time, lang)}</>}
                      </span>
                    )}
                    {task.assigned_staff && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> {task.assigned_staff}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
