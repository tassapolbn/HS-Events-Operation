import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArchiveRestore, CalendarDays, ChevronRight, ClipboardList, FolderArchive, Inbox, MapPin, Search, Trash2,
  type LucideIcon
} from 'lucide-react';
import {
  useArchivedEvents, useArchivedRequests, useArchiveMutations, type ArchivedEvent, type ArchivedRequest
} from '../hooks/useArchive';
import { useDepartments } from '../hooks/useDepartments';
import { useCampus } from '../contexts/CampusContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { EventStatusBadge, TaskStatusBadge } from '../components/ui/Badge';
import { CampusBadge } from '../components/ui/CampusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useArchiveFeedback, type ResultKey } from '../components/archive/ArchiveControls';
import { departmentIcon } from '../lib/constants';
import { eventLastDay, restoreStatus } from '../lib/archive';
import { scheduleLabel } from '../lib/requestSchedule';
import { cn, fillTemplate, formatDate } from '../lib/utils';
import type { Department } from '../types';

type Tab = 'events' | 'requests';

function matchesSearch(term: string, values: Array<string | null | undefined>): boolean {
  return !term || values.some((value) => value?.toLowerCase().includes(term));
}

/**
 * The Archive folder: past and completed events and requests, out of the
 * working lists. Tick items to restore them or delete them.
 */
export function ArchivePage() {
  const { t, deptName } = useLanguage();
  const { toast } = useToast();
  const { campusFilter } = useCampus();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'requests' ? 'requests' : 'events';

  const eventsQuery = useArchivedEvents(campusFilter);
  const requestsQuery = useArchivedRequests(campusFilter);
  const { data: departments } = useDepartments();
  const mutations = useArchiveMutations();
  const report = useArchiveFeedback();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Ticks never carry over to a different tab or campus
  useEffect(() => setSelected(new Set()), [tab, campusFilter]);

  const setTab = (next: Tab) => setSearchParams(next === 'requests' ? { tab: 'requests' } : {}, { replace: true });

  const deptById = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d])), [departments]);
  const term = search.trim().toLowerCase();

  const visibleEvents = useMemo(
    () => (eventsQuery.data ?? []).filter((e) =>
      matchesSearch(term, [e.name, e.location, t(`categories.${e.category}` as never)])),
    [eventsQuery.data, term, t]
  );
  const visibleRequests = useMemo(
    () => (requestsQuery.data ?? []).filter((r) =>
      matchesSearch(term, [r.title, r.location, r.reference, deptName(deptById.get(r.department_id))])),
    [requestsQuery.data, term, deptName, deptById]
  );

  const isEvents = tab === 'events';
  const active = isEvents ? eventsQuery : requestsQuery;
  const visibleIds = isEvents ? visibleEvents.map((e) => e.id) : visibleRequests.map((r) => r.id);
  // Only rows on screen are ever acted on, so a search can never hide what is about to be deleted
  const chosen = visibleIds.filter((id) => selected.has(id));
  const allChosen = visibleIds.length > 0 && chosen.length === visibleIds.length;
  const someChosen = chosen.length > 0 && !allChosen;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChosen;
  }, [someChosen]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allChosen) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const busy = [
    mutations.restoreEvents, mutations.restoreRequests, mutations.deleteEvents, mutations.deleteRequests,
    mutations.archiveEvents, mutations.archiveRequests, mutations.undeleteEvents, mutations.undeleteRequests
  ].some((m) => m.isPending);

  /** Runs an Undo from a toast and reports its own outcome */
  const runUndo = async (action: () => Promise<number>, key: ResultKey, requested: number) => {
    try {
      report(await action(), requested, key);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const restore = async () => {
    const ids = chosen;
    try {
      if (isEvents) {
        const rows = (eventsQuery.data ?? []).filter((e) => ids.includes(e.id));
        const changed = await mutations.restoreEvents.mutateAsync(rows);
        report(changed, ids.length, 'archive.restoredCount', () =>
          runUndo(() => mutations.archiveEvents.mutateAsync(ids), 'archive.archivedCount', ids.length));
      } else {
        const changed = await mutations.restoreRequests.mutateAsync(ids);
        report(changed, ids.length, 'archive.restoredCount', () =>
          runUndo(() => mutations.archiveRequests.mutateAsync(ids), 'archive.archivedCount', ids.length));
      }
      setSelected(new Set());
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const remove = async () => {
    const ids = chosen;
    try {
      const changed = isEvents
        ? await mutations.deleteEvents.mutateAsync(ids)
        : await mutations.deleteRequests.mutateAsync(ids);
      report(changed, ids.length, 'archive.deletedCount', () =>
        runUndo(
          () => (isEvents ? mutations.undeleteEvents.mutateAsync(ids) : mutations.undeleteRequests.mutateAsync(ids)),
          'archive.restoredCount',
          ids.length
        ));
      setSelected(new Set());
      setConfirmDelete(false);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">
          <FolderArchive className="h-7 w-7 text-navy-600 dark:text-gold-400" /> {t('archive.title')}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{t('archive.subtitle')}</p>
      </div>

      <div role="tablist" className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900 sm:w-fit">
        <TabButton active={isEvents} onClick={() => setTab('events')} icon={ClipboardList} label={t('nav.events')} count={eventsQuery.data?.length} />
        <TabButton active={!isEvents} onClick={() => setTab('requests')} icon={Inbox} label={t('nav.requests')} count={requestsQuery.data?.length} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('archive.searchPlaceholder')}
          aria-label={t('archive.searchPlaceholder')}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {visibleIds.length > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allChosen}
              onChange={toggleAll}
              className="h-5 w-5 cursor-pointer accent-navy-700 dark:accent-gold-400"
            />
            {chosen.length > 0 ? fillTemplate(t('archive.selectedCount'), { n: chosen.length }) : t('archive.selectAll')}
          </label>
          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-medium text-navy-600 hover:underline dark:text-gold-400"
            >
              {t('archive.clearSelection')}
            </button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" disabled={!chosen.length || busy} onClick={restore}>
            <ArchiveRestore className="h-4 w-4" /> {t('archive.restore')}
          </Button>
          <Button variant="danger" size="sm" disabled={!chosen.length || busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> {t('archive.delete')}
          </Button>
        </div>
      )}

      {active.isLoading ? (
        <Spinner />
      ) : active.error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {t('errors.loadFailed')}
        </p>
      ) : visibleIds.length === 0 ? (
        <EmptyState
          icon={FolderArchive}
          message={term ? t('common.noResults') : t(isEvents ? 'archive.emptyEvents' : 'archive.emptyRequests')}
          action={term ? undefined : <p className="max-w-sm px-4 text-xs text-slate-400 dark:text-slate-500">{t('archive.emptyHint')}</p>}
        />
      ) : (
        <ul className="grid gap-2.5">
          {isEvents
            ? visibleEvents.map((event) => (
                <ArchivedEventRow key={event.id} event={event} checked={selected.has(event.id)} onToggle={() => toggle(event.id)} />
              ))
            : visibleRequests.map((request) => (
                <ArchivedRequestRow
                  key={request.id}
                  request={request}
                  dept={deptById.get(request.department_id)}
                  checked={selected.has(request.id)}
                  onToggle={() => toggle(request.id)}
                />
              ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={fillTemplate(t(isEvents ? 'archive.deleteEventsTitle' : 'archive.deleteRequestsTitle'), { n: chosen.length })}
        message={t(isEvents ? 'archive.deleteEventsText' : 'archive.deleteRequestsText')}
        confirmLabel={t('archive.delete')}
        loading={mutations.deleteEvents.isPending || mutations.deleteRequests.isPending}
      />
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: {
  active: boolean; onClick: () => void; icon: LucideIcon; label: string; count: number | undefined;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none',
        active ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      )}
    >
      <Icon className="h-4 w-4" /> {label}
      {count !== undefined && (
        <span className={cn('rounded-full px-1.5 text-xs font-bold', active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800')}>
          {count}
        </span>
      )}
    </button>
  );
}

/** "Archived 9 Oct 2026 by Name" */
function ArchivedLine({ at, by }: { at: string | null; by: { full_name: string } | null }) {
  const { t, lang } = useLanguage();
  if (!at) return null;
  return (
    <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
      {t('archive.archivedOn')} {formatDate(at, lang, 'd MMM yyyy')}
      {by?.full_name && <> {t('archive.by')} {by.full_name}</>}
    </p>
  );
}

function RowShell({ checked, onToggle, accent, href, children, label }: {
  checked: boolean; onToggle: () => void; accent: string; href: string; children: React.ReactNode; label: string;
}) {
  const { t } = useLanguage();
  return (
    <li
      className={cn(
        'flex items-stretch overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors dark:bg-slate-900',
        checked ? 'border-navy-400 ring-2 ring-navy-500/20 dark:border-gold-500 dark:ring-gold-400/20' : 'border-slate-200 dark:border-slate-800'
      )}
      style={{ borderLeft: `5px solid ${accent}` }}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 p-3.5 sm:p-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={label}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-navy-700 dark:accent-gold-400"
        />
        <div className="min-w-0 flex-1">{children}</div>
      </label>
      <Link
        to={href}
        title={t('common.view')}
        aria-label={`${t('common.view')}: ${label}`}
        className="flex w-11 shrink-0 items-center justify-center border-l border-slate-100 text-slate-400 transition-colors hover:bg-slate-50 hover:text-navy-700 dark:border-slate-800 dark:hover:bg-slate-800 dark:hover:text-gold-300"
      >
        <ChevronRight className="h-5 w-5" />
      </Link>
    </li>
  );
}

function ArchivedEventRow({ event, checked, onToggle }: { event: ArchivedEvent; checked: boolean; onToggle: () => void }) {
  const { t, lang } = useLanguage();
  const last = eventLastDay(event);
  return (
    <RowShell checked={checked} onToggle={onToggle} accent={event.header_color || '#1a3c5e'} href={`/events/${event.id}`} label={event.name}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 font-bold text-slate-800 dark:text-slate-100">{event.name}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <CampusBadge campus={event.campus} />
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            {t('archive.restoresTo')} <EventStatusBadge status={restoreStatus(event)} />
          </span>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDate(event.event_date, lang, 'd MMM yyyy')}
          {last !== event.event_date && <> – {formatDate(last, lang, 'd MMM yyyy')}</>}
        </span>
        {event.location && (
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {event.location}</span>
        )}
        <span>{event.task_count} {t(event.task_count === 1 ? 'archive.task' : 'archive.tasks')}</span>
      </div>
      <ArchivedLine at={event.archived_at} by={event.archived_by_profile} />
    </RowShell>
  );
}

function ArchivedRequestRow({ request, dept, checked, onToggle }: {
  request: ArchivedRequest; dept: Department | undefined; checked: boolean; onToggle: () => void;
}) {
  const { t, lang, deptName } = useLanguage();
  const Icon = departmentIcon(dept?.icon ?? 'users');
  const due = request.due_at || request.due_date;
  return (
    <RowShell checked={checked} onToggle={onToggle} accent={dept?.color ?? '#64748b'} href={`/requests/${request.id}`} label={request.title}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 font-bold text-slate-800 dark:text-slate-100">{request.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <CampusBadge campus={request.campus} />
          <TaskStatusBadge status={request.status} />
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {dept && (
          <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: dept.color }}>
            <Icon className="h-3.5 w-3.5" /> {deptName(dept)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" /> {scheduleLabel(request.setup_datetime ?? request.request_date, lang)}
        </span>
        {due && <span>{t('requests.dueDate')}: {scheduleLabel(due, lang)}</span>}
        {request.location && (
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {request.location}</span>
        )}
        {request.reference && <span>{t('requests.reference')}: {request.reference}</span>}
      </div>
      <ArchivedLine at={request.archived_at ?? null} by={request.archived_by_profile} />
    </RowShell>
  );
}
