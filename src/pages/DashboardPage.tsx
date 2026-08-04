import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays, CheckCircle2, ClipboardList, Clock, Inbox, MapPin, Plus, TrendingUp
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { useDepartments } from '../hooks/useDepartments';
import { useRecentActivity } from '../hooks/useAudit';
import { useAuth } from '../contexts/AuthContext';
import { useCampus } from '../contexts/CampusContext';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EventStatusBadge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { departmentIcon } from '../lib/constants';
import { formatDate, formatDateTime, formatTime } from '../lib/utils';
import type { EventWithTasks } from '../types';

export function DashboardPage() {
  const { t, deptName, lang } = useLanguage();
  const { profile, isEventsTeam } = useAuth();
  const navigate = useNavigate();
  const { campusFilter } = useCampus();
  const { data, isLoading } = useDashboard(campusFilter);
  const { data: departments } = useDepartments();
  const { data: activity } = useRecentActivity(8);

  if (isLoading || !data) return <Spinner />;

  const stat = (icon: React.ReactNode, label: string, value: number | string, tone: string) => (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
        <div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </Card>
  );

  const eventRow = (event: EventWithTasks) => (
    <li
      key={event.id}
      onClick={() => navigate(`/events/${event.id}`)}
      className="flex cursor-pointer flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{event.name}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> {formatDate(event.event_date, lang)}
          </span>
          {event.event_start && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatTime(event.event_start, lang)}
            </span>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {event.location}
            </span>
          )}
        </p>
      </div>
      <EventStatusBadge status={event.status} />
    </li>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {profile?.full_name ? `${profile.full_name}, ` : ''}{t('dashboard.welcome')}
          </p>
        </div>
        {isEventsTeam && (
          <div className="flex gap-2">
            <Link to="/events/new">
              <Button variant="gold" size="sm"><Plus className="h-4 w-4" /> {t('dashboard.quickCreateEvent')}</Button>
            </Link>
            <Link to="/requests/new">
              <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> {t('dashboard.quickCreateRequest')}</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(<CalendarDays className="h-5 w-5 text-navy-700 dark:text-navy-200" />, t('dashboard.todaysEvents'), data.todayEvents.length, 'bg-navy-100 dark:bg-navy-800')}
        {stat(<TrendingUp className="h-5 w-5 text-gold-600 dark:text-gold-300" />, t('dashboard.upcomingEvents'), data.upcomingEvents.length, 'bg-gold-100 dark:bg-gold-900/40')}
        {stat(<ClipboardList className="h-5 w-5 text-sky-600 dark:text-sky-300" />, t('dashboard.pendingTasks'), data.pendingTasks, 'bg-sky-100 dark:bg-sky-900/40')}
        {stat(<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />, t('dashboard.completedTasks'), data.completedTasks, 'bg-emerald-100 dark:bg-emerald-900/40')}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Today */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.todaysEvents')}</CardTitle>
              <Link to="/calendar" className="text-xs font-medium text-navy-600 hover:underline dark:text-gold-400">
                {t('dashboard.calendar')}
              </Link>
            </CardHeader>
            <CardBody className="px-2 py-2">
              {data.todayEvents.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">{t('dashboard.noEventsToday')}</p>
              ) : (
                <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">{data.todayEvents.map(eventRow)}</ul>
              )}
            </CardBody>
          </Card>

          {/* Upcoming */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.upcomingEvents')}</CardTitle>
              <Link to="/events" className="text-xs font-medium text-navy-600 hover:underline dark:text-gold-400">
                {t('common.viewAll')}
              </Link>
            </CardHeader>
            <CardBody className="px-2 py-2">
              {data.upcomingEvents.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">{t('dashboard.noUpcoming')}</p>
              ) : (
                <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {data.upcomingEvents.slice(0, 6).map(eventRow)}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          {/* Department workload */}
          <Card>
            <CardHeader><CardTitle>{t('dashboard.departmentWorkload')}</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {(departments ?? []).map((dept) => {
                const load = data.workload[dept.id] ?? { open: 0, total: 0 };
                const pct = load.total > 0 ? Math.round((load.open / Math.max(load.total, 1)) * 100) : 0;
                const Icon = departmentIcon(dept.icon);
                return (
                  <div key={dept.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: dept.color }}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate">{deptName(dept)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{load.open} {t('dashboard.openTasks')}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: dept.color }} />
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {/* Recent activity */}
          {isEventsTeam && (
            <Card>
              <CardHeader><CardTitle>{t('dashboard.recentActivity')}</CardTitle></CardHeader>
              <CardBody className="px-3 py-2">
                {!activity || activity.length === 0 ? (
                  <p className="py-5 text-center text-sm text-slate-400">{t('dashboard.noActivity')}</p>
                ) : (
                  <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
                    {activity.map((entry) => (
                      <li key={entry.id} className="px-1 py-2.5">
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-semibold">{entry.changed_by_profile?.full_name ?? '-'}</span>{' '}
                          <span className="text-slate-400">{t(`audit.${entry.action}` as never).toLowerCase()}</span>{' '}
                          <span className="font-medium">
                            {String((entry.new_data?.name ?? entry.new_data?.title ?? entry.old_data?.name ?? entry.old_data?.title ?? entry.table_name) || '')}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(entry.created_at, lang)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {!isEventsTeam && (
            <Card>
              <CardHeader><CardTitle>{t('nav.myDepartment')}</CardTitle></CardHeader>
              <CardBody>
                <Link to="/my-department">
                  <Button variant="outline" className="w-full"><Inbox className="h-4 w-4" /> {t('myDept.title')}</Button>
                </Link>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
