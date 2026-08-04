import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Inbox, MapPin, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useRequests, type RequestFilters } from '../hooks/useRequests';
import { useDepartments } from '../hooks/useDepartments';
import { useDebounce } from '../hooks/useDebounce';
import { useLanguage } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { useCampus } from '../contexts/CampusContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { PriorityBadge, TaskStatusBadge } from '../components/ui/Badge';
import { CampusBadge } from '../components/ui/CampusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { PRIORITIES, REQUEST_STATUSES, departmentIcon } from '../lib/constants';
import { formatDate } from '../lib/utils';

export function RequestsPage() {
  const { t, deptName, lang } = useLanguage();
  const { isEventsTeam } = useAuth();
  const { campusFilter } = useCampus();
  const navigate = useNavigate();
  const { data: departments } = useDepartments();

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const debouncedSearch = useDebounce(search);
  const filters = useMemo<RequestFilters>(
    () => ({
      search: debouncedSearch || undefined,
      departmentId: departmentId || undefined,
      status: status || undefined,
      priority: priority || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      campus: campusFilter
    }),
    [debouncedSearch, departmentId, status, priority, dateFrom, dateTo, campusFilter]
  );

  const { data: requests, isLoading } = useRequests(filters);
  const hasFilters = !!(departmentId || status || priority || dateFrom || dateTo);

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">{t('requests.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('requests.subtitle')}</p>
        </div>
        {isEventsTeam && (
          <Link to="/requests/new">
            <Button variant="gold"><Plus className="h-4 w-4" /> {t('requests.newRequest')}</Button>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('requests.searchPlaceholder')}
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
            <Select label={t('common.department')} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{deptName(d)}</option>)}
            </Select>
            <Select label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>)}
            </Select>
            <Select label={t('common.priority')} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </Select>
            <Input label={t('events.dateFrom')} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input label={t('events.dateTo')} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </Card>
      )}

      {isLoading ? (
        <Spinner />
      ) : !requests || requests.length === 0 ? (
        <EmptyState icon={Inbox} message={hasFilters || search ? t('common.noResults') : t('requests.noRequests')} />
      ) : (
        <div className="grid gap-3">
          {requests.map((request) => {
            const dept = (departments ?? []).find((d) => d.id === request.department_id);
            const Icon = departmentIcon(dept?.icon ?? 'users');
            return (
              <Card key={request.id} onClick={() => navigate(`/requests/${request.id}`)} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  {dept && (
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: dept.color }}
                      title={deptName(dept)}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{request.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {dept && <span className="font-medium" style={{ color: dept.color }}>{deptName(dept)}</span>}
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDate(request.request_date, lang)}
                      </span>
                      {request.due_date && (
                        <span>{t('requests.dueDate')}: {formatDate(request.due_date, lang)}</span>
                      )}
                      {request.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> {request.location}
                        </span>
                      )}
                      {request.reference && <span>{t('requests.reference')}: {request.reference}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CampusBadge campus={request.campus} />
                    <PriorityBadge priority={request.priority} />
                    <TaskStatusBadge status={request.status} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
