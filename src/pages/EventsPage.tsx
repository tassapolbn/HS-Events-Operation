import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, Plus, Search, SlidersHorizontal, ClipboardList } from 'lucide-react';
import { useEvents, type EventFilters } from '../hooks/useEvents';
import { useDepartments } from '../hooks/useDepartments';
import { useDebounce } from '../hooks/useDebounce';
import { useLanguage } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select, Input } from '../components/ui/Input';
import { EventStatusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { EVENT_STATUSES, departmentIcon } from '../lib/constants';
import { cn, formatDate } from '../lib/utils';

export function EventsPage() {
  const { t, deptName, lang } = useLanguage();
  const { isEventsTeam } = useAuth();
  const navigate = useNavigate();
  const { data: departments } = useDepartments();

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [staff, setStaff] = useState('');

  const debouncedSearch = useDebounce(search);
  const debouncedStaff = useDebounce(staff);

  const filters = useMemo<EventFilters>(
    () => ({
      search: debouncedSearch || undefined,
      status: status || undefined,
      departmentId: departmentId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      staff: debouncedStaff || undefined
    }),
    [debouncedSearch, status, departmentId, dateFrom, dateTo, debouncedStaff]
  );

  const { data: events, isLoading } = useEvents(filters);
  const hasFilters = !!(status || departmentId || dateFrom || dateTo || staff);

  const clearFilters = () => {
    setStatus(''); setDepartmentId(''); setDateFrom(''); setDateTo(''); setStaff('');
  };

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">{t('events.title')}</h1>
        {isEventsTeam && (
          <Link to="/events/new">
            <Button variant="gold"><Plus className="h-4 w-4" /> {t('events.newEvent')}</Button>
          </Link>
        )}
      </div>

      {/* Search + filter toggle */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('events.searchPlaceholder')}
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <Button variant={showFilters || hasFilters ? 'primary' : 'outline'} onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal className="h-4 w-4" /> {t('common.filters')}
        </Button>
      </div>

      {showFilters && (
        <Card className="animate-slide-up p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {EVENT_STATUSES.map((s) => <option key={s} value={s}>{t(`eventStatus.${s}`)}</option>)}
            </Select>
            <Select label={t('common.department')} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{deptName(d)}</option>)}
            </Select>
            <Input label={t('events.dateFrom')} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input label={t('events.dateTo')} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Input label={t('events.assignedStaff')} value={staff} onChange={(e) => setStaff(e.target.value)} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-3 text-xs font-medium text-navy-600 hover:underline dark:text-gold-400">
              {t('common.clearFilters')}
            </button>
          )}
        </Card>
      )}

      {isLoading ? (
        <Spinner />
      ) : !events || events.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          message={hasFilters || search ? t('common.noResults') : t('events.noEvents')}
          action={
            isEventsTeam && !hasFilters && !search ? (
              <Link to="/events/new"><Button size="sm" variant="gold"><Plus className="h-4 w-4" /> {t('events.newEvent')}</Button></Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {events.map((event) => {
            const deptSummary = (departments ?? []).map((dept) => {
              const tasks = event.event_tasks.filter((task) => task.department_id === dept.id);
              return { dept, total: tasks.length, done: tasks.filter((task) => task.status === 'completed').length };
            }).filter((x) => x.total > 0);
            return (
              <Card key={event.id} onClick={() => navigate(`/events/${event.id}`)} className="p-4 sm:p-5" style={{ borderLeft: `5px solid ${event.header_color || '#1a3c5e'}` }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{event.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDate(event.event_date, lang)}
                      </span>
                      {event.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> {event.location}
                        </span>
                      )}
                      <span className="text-slate-400">{t(`categories.${event.category}` as never)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <EventStatusBadge status={event.status} />
                  </div>
                </div>
                {deptSummary.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {deptSummary.map(({ dept, total, done }) => {
                      const Icon = departmentIcon(dept.icon);
                      return (
                        <span
                          key={dept.id}
                          className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white')}
                          style={{ backgroundColor: dept.color }}
                          title={deptName(dept)}
                        >
                          <Icon className="h-3 w-3" /> {done}/{total}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
