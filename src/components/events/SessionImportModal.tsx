import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Layers, MapPin, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useEvent } from '../../hooks/useEvents';
import { useSessionMutations, useSessionSourceEvents } from '../../hooks/useSessions';
import { useTaskMutations } from '../../hooks/useTasks';
import { useAuth } from '../../contexts/AuthContext';
import { cn, combineDateTime, dayDiff, extractTime, formatDate, shiftDate } from '../../lib/utils';
import type { EventSession } from '../../types';

interface SessionImportModalProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** The event being planned, used as the base date for task times */
  eventDate: string;
  /** Where the copied sessions are placed in the running order */
  nextSortOrder: number;
}

export function SessionImportModal({ open, onClose, eventId, eventDate, nextSortOrder }: SessionImportModalProps) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { createSession } = useSessionMutations(eventId);
  const { createTasks } = useTaskMutations(eventId);

  const [search, setSearch] = useState('');
  const [sourceEventId, setSourceEventId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<'keep' | 'shift'>('shift');
  const [targetDate, setTargetDate] = useState(eventDate);
  const [copyTasks, setCopyTasks] = useState(true);
  const [resetStatus, setResetStatus] = useState(true);
  const [working, setWorking] = useState(false);

  const { data: sources, isLoading } = useSessionSourceEvents(eventId, open);
  const { data: sourceEvent, isLoading: loadingSource } = useEvent(sourceEventId ?? undefined);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSourceEventId(null);
    setChecked([]);
    setDateMode('shift');
    setTargetDate(eventDate);
    setCopyTasks(true);
    setResetStatus(true);
  }, [open, eventDate]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sources ?? [];
    return (sources ?? []).filter((event) => event.name.toLowerCase().includes(needle));
  }, [sources, search]);

  const sourceSessions = sourceEvent?.event_sessions ?? [];
  const taskCount = (sessionId: string) =>
    (sourceEvent?.event_tasks ?? []).filter((task) => task.session_id === sessionId).length;

  const selected = useMemo(
    () => sourceSessions.filter((session) => checked.includes(session.id)),
    [sourceSessions, checked]
  );

  const firstDate = useMemo(() => {
    if (selected.length === 0) return null;
    return [...selected].sort((a, b) => a.session_date.localeCompare(b.session_date))[0].session_date;
  }, [selected]);

  const previewDate = (session: EventSession) => {
    if (dateMode === 'keep' || !firstDate || !targetDate) return session.session_date;
    return shiftDate(session.session_date, dayDiff(firstDate, targetDate));
  };

  const runImport = async () => {
    if (selected.length === 0 || !sourceEvent) return;
    setWorking(true);
    try {
      const ordered = [...selected].sort(
        (a, b) => a.session_date.localeCompare(b.session_date) || a.sort_order - b.sort_order
      );
      for (const [index, session] of ordered.entries()) {
        const newDate = previewDate(session);
        const created = await createSession.mutateAsync({
          title: session.title,
          session_date: newDate,
          location: session.location,
          start_time: combineDateTime(newDate, extractTime(session.start_time)),
          end_time: combineDateTime(newDate, extractTime(session.end_time)),
          time_note: session.time_note ?? '',
          note: session.note ?? '',
          sort_order: nextSortOrder + index
        });
        if (!copyTasks) continue;
        const tasks = sourceEvent.event_tasks.filter((task) => task.session_id === session.id);
        if (tasks.length === 0) continue;
        await createTasks.mutateAsync(
          tasks.map((task) => ({
            event_id: eventId,
            department_id: task.department_id,
            session_id: created.id,
            title: task.title,
            description: task.description,
            instructions: task.instructions,
            work_location: task.work_location,
            setup_location: task.setup_location,
            assigned_staff: task.assigned_staff,
            start_time: combineDateTime(eventDate, extractTime(task.start_time)),
            completion_time: combineDateTime(eventDate, extractTime(task.completion_time)),
            priority: task.priority,
            status: resetStatus ? ('not_started' as const) : task.status,
            notes: task.notes,
            sort_order: task.sort_order,
            created_by: profile?.id ?? null
          }))
        );
      }
      toast(`${t('sessions.imported')} (${ordered.length})`);
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sessions.importTitle')}
      subtitle={t('sessions.importHint')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void runImport()} disabled={selected.length === 0} loading={working}>
            {t('sessions.importAction')}
            {selected.length > 0 && ` (${selected.length})`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-5">
        {/* Source events */}
        <div className="sm:col-span-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('sessions.searchEvents')}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus:border-gold-400"
            />
          </div>
          {isLoading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <p className="px-1 py-4 text-xs italic text-slate-400">{t('sessions.noSourceEvents')}</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {filtered.map((event) => (
                <li key={event.id}>
                  <button
                    onClick={() => {
                      setSourceEventId(event.id);
                      setChecked([]);
                    }}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                      sourceEventId === event.id
                        ? 'border-navy-500 bg-navy-50 dark:border-gold-400 dark:bg-navy-900/50'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    )}
                  >
                    <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                      {event.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {formatDate(event.event_date, lang, 'd MMM yyyy')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3" /> {event.event_sessions.length}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sessions of the chosen event */}
        <div className="space-y-3 sm:col-span-3">
          {!sourceEventId ? (
            <p className="px-1 py-4 text-xs italic text-slate-400">{t('sessions.importHint')}</p>
          ) : loadingSource ? (
            <Spinner />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('sessions.chooseSessions')}
                </h4>
                <button
                  onClick={() =>
                    setChecked(
                      checked.length === sourceSessions.length ? [] : sourceSessions.map((session) => session.id)
                    )
                  }
                  className="text-[11px] font-semibold text-navy-600 hover:underline dark:text-gold-400"
                >
                  {t('sessions.selectAll')}
                </button>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {sourceSessions.map((session) => {
                  const isChecked = checked.includes(session.id);
                  return (
                    <li key={session.id}>
                      <button
                        onClick={() =>
                          setChecked((prev) =>
                            prev.includes(session.id)
                              ? prev.filter((id) => id !== session.id)
                              : [...prev, session.id]
                          )
                        }
                        className={cn(
                          'flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                          isChecked
                            ? 'border-navy-500 bg-navy-50 dark:border-gold-400 dark:bg-navy-900/50'
                            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            isChecked
                              ? 'border-navy-700 bg-navy-700 text-white dark:border-gold-400 dark:bg-gold-400 dark:text-navy-900'
                              : 'border-slate-300 dark:border-slate-600'
                          )}
                        >
                          {isChecked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                            {session.title || formatDate(session.session_date, lang, 'EEEE d MMMM')}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(session.session_date, lang, 'd MMM')}
                              {isChecked && previewDate(session) !== session.session_date && (
                                <span className="font-semibold text-navy-600 dark:text-gold-400">
                                  {' '}
                                  &rarr; {formatDate(previewDate(session), lang, 'd MMM yyyy')}
                                </span>
                              )}
                            </span>
                            {session.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {session.location}
                              </span>
                            )}
                            <span>
                              {taskCount(session.id)} {t('grid.tasksWord')}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('sessions.dateMode')}
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    checked={dateMode === 'shift'}
                    onChange={() => setDateMode('shift')}
                    className="h-4 w-4 accent-navy-700 dark:accent-gold-400"
                  />
                  {t('sessions.dateShift')}
                </label>
                {dateMode === 'shift' && (
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                    className="pl-6"
                  />
                )}
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    checked={dateMode === 'keep'}
                    onChange={() => setDateMode('keep')}
                    className="h-4 w-4 accent-navy-700 dark:accent-gold-400"
                  />
                  {t('sessions.dateKeep')}
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-gold-200 bg-gold-50/60 p-3 dark:border-gold-900 dark:bg-gold-950/20">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={copyTasks}
                    onChange={(event) => setCopyTasks(event.target.checked)}
                    className="h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
                  />
                  {t('sessions.copyTasksToo')}
                </label>
                {copyTasks && (
                  <label className="flex cursor-pointer items-center gap-2 pl-6 text-xs text-slate-500 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={resetStatus}
                      onChange={(event) => setResetStatus(event.target.checked)}
                      className="h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
                    />
                    {t('sessions.resetStatus')}
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
