import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarDays, ClipboardList, Inbox, MapPin } from 'lucide-react';
import { useMyDepartmentTasks } from '../hooks/useTasks';
import { useRequests } from '../hooks/useRequests';
import { useDepartments } from '../hooks/useDepartments';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { Card } from '../components/ui/Card';
import { PriorityBadge, TaskStatusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { departmentIcon } from '../lib/constants';
import { cn, formatDate, formatTime } from '../lib/utils';

export function MyDepartmentPage() {
  const { t, deptName, lang } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'tasks' | 'requests'>('tasks');

  const { data: departments } = useDepartments();
  const dept = (departments ?? []).find((d) => d.id === profile?.department_id);
  const { data: tasks, isLoading: tasksLoading } = useMyDepartmentTasks(profile?.department_id);
  const { data: requests, isLoading: requestsLoading } = useRequests(
    profile?.department_id ? { departmentId: profile.department_id } : {}
  );

  if (!profile?.department_id) {
    return <EmptyState icon={Building2} message={t('myDept.noDepartment')} />;
  }

  const Icon = departmentIcon(dept?.icon ?? 'users');

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-3">
        {dept && (
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: dept.color }}>
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-navy-800 dark:text-white">{deptName(dept)}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('myDept.title')}</p>
        </div>
      </div>

      <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900 sm:w-fit">
        <button
          onClick={() => setTab('tasks')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none',
            tab === 'tasks' ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900' : 'text-slate-500'
          )}
        >
          <ClipboardList className="h-4 w-4" /> {t('myDept.eventTasks')}
        </button>
        <button
          onClick={() => setTab('requests')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none',
            tab === 'requests' ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900' : 'text-slate-500'
          )}
        >
          <Inbox className="h-4 w-4" /> {t('myDept.requests')}
        </button>
      </div>

      {tab === 'tasks' &&
        (tasksLoading ? (
          <Spinner />
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState message={t('myDept.noTasks')} />
        ) : (
          <div className="grid gap-3">
            {tasks.map((task) => (
              <Card key={task.id} onClick={() => navigate(`/events/${task.event_id}`)} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">{task.title}</p>
                  <PriorityBadge priority={task.priority} />
                  <TaskStatusBadge status={task.status} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-navy-700 dark:text-gold-300">{task.events.name}</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(task.events.event_date, lang)}
                  </span>
                  {task.start_time && <span>{formatTime(task.start_time, lang)}</span>}
                  {(task.work_location || task.events.location) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {task.work_location || task.events.location}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ))}

      {tab === 'requests' &&
        (requestsLoading ? (
          <Spinner />
        ) : !requests || requests.length === 0 ? (
          <EmptyState message={t('requests.noRequests')} />
        ) : (
          <div className="grid gap-3">
            {requests.map((request) => (
              <Card key={request.id} onClick={() => navigate(`/requests/${request.id}`)} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">{request.title}</p>
                  <PriorityBadge priority={request.priority} />
                  <TaskStatusBadge status={request.status} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(request.request_date, lang)}
                  </span>
                  {request.due_date && <span>{t('requests.dueDate')}: {formatDate(request.due_date, lang)}</span>}
                  {request.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {request.location}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}
