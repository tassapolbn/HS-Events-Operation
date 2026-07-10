import { useState } from 'react';
import { CalendarDays, Check, MapPin, Paperclip, Clock, User } from 'lucide-react';
import {
  useDisplayDepartments, useDisplayEvents, useToggleDisplayTask
} from '../hooks/usePublicDisplay';
import { getSignedUrl } from '../hooks/useAttachments';
import { useLanguage } from '../i18n';
import { DisplayShell } from '../components/display/DisplayShell';
import { RichTextViewer } from '../components/editor/RichTextViewer';
import { Spinner } from '../components/ui/Spinner';
import { departmentIcon } from '../lib/constants';
import { cn, formatDate, formatTime, isRichTextEmpty } from '../lib/utils';
import type { DisplayAttachment, DisplayEvent } from '../types';

function AttachmentChips({ files }: { files: DisplayAttachment[] }) {
  const open = async (file: DisplayAttachment) => {
    try {
      const url = await getSignedUrl(file.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch {
      /* board is read-only; ignore */
    }
  };
  if (files.length === 0) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <button
          key={file.id}
          onClick={() => open(file)}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Paperclip className="h-3 w-3" /> {file.file_name}
        </button>
      ))}
    </span>
  );
}

export function DisplayEventsPage() {
  const { t, deptName, lang } = useLanguage();
  const [selectedDept, setSelectedDept] = useState('');
  const { data: departments } = useDisplayDepartments();
  const { data: events, isLoading, refetch, isFetching, dataUpdatedAt } = useDisplayEvents();
  const toggleTask = useToggleDisplayTask();

  const milestones = (event: DisplayEvent) =>
    [
      { label: t('timeline.setupBegins'), value: event.setup_start },
      { label: t('timeline.venueReady'), value: event.venue_ready },
      { label: t('timeline.eventStarts'), value: event.event_start },
      { label: t('timeline.eventEnds'), value: event.event_finish },
      { label: t('timeline.breakdownBegins'), value: event.breakdown_start },
      { label: t('timeline.breakdownComplete'), value: event.breakdown_deadline }
    ].filter((m) => m.value);

  return (
    <DisplayShell
      title={t('display.eventsTitle')}
      departments={departments ?? []}
      selectedDepartmentId={selectedDept}
      onSelectDepartment={setSelectedDept}
      onRefresh={() => refetch()}
      refreshing={isFetching}
      updatedAt={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
    >
      {isLoading ? (
        <Spinner />
      ) : !events || events.length === 0 ? (
        <p className="py-24 text-center text-xl text-slate-400">{t('display.noEvents')}</p>
      ) : (
        <div className="space-y-8">
          {events.map((event) => {
            const visibleDepts = (departments ?? []).filter(
              (dept) => (!selectedDept || dept.id === selectedDept) && event.tasks.some((task) => task.department_id === dept.id)
            );
            if (selectedDept && visibleDepts.length === 0) return null;
            return (
              <section key={event.id} className="overflow-hidden rounded-3xl bg-white shadow-md dark:bg-slate-900">
                {/* Event header with custom colors */}
                <header
                  className="px-6 py-5 lg:px-8"
                  style={{ backgroundColor: event.header_color, color: event.header_text_color }}
                >
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <h2 className="text-2xl font-extrabold tracking-tight lg:text-4xl">{event.name}</h2>
                    <span className="flex items-center gap-2 text-base font-semibold opacity-90 lg:text-xl">
                      <CalendarDays className="h-5 w-5" /> {formatDate(event.event_date, lang, 'EEEE d MMMM yyyy')}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-2 text-base font-semibold opacity-90 lg:text-xl">
                        <MapPin className="h-5 w-5" /> {event.location}
                      </span>
                    )}
                  </div>
                  {milestones(event).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {milestones(event).map((m) => (
                        <span
                          key={m.label}
                          className="rounded-full px-3 py-1.5 text-sm font-bold lg:text-base"
                          style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
                        >
                          {m.label} {formatTime(m.value, lang)}
                        </span>
                      ))}
                    </div>
                  )}
                  {!isRichTextEmpty(event.description) && (
                    <RichTextViewer html={event.description} className="mt-3 max-w-4xl !text-base opacity-90" />
                  )}
                  <AttachmentChips files={event.attachments} />
                </header>

                {/* Department panels */}
                <div
                  className={cn(
                    'grid gap-4 p-5 lg:p-6',
                    selectedDept ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-4'
                  )}
                >
                  {visibleDepts.map((dept) => {
                    const Icon = departmentIcon(dept.icon);
                    const tasks = event.tasks.filter((task) => task.department_id === dept.id);
                    const done = tasks.filter((task) => task.status === 'completed').length;
                    return (
                      <div
                        key={dept.id}
                        className="flex flex-col overflow-hidden rounded-2xl border-2 bg-slate-50 dark:bg-slate-800/50"
                        style={{ borderColor: dept.color }}
                      >
                        <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: dept.color }}>
                          <Icon className="h-6 w-6" />
                          <h3 className="flex-1 text-base font-extrabold lg:text-lg">{deptName(dept)}</h3>
                          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold">
                            {done}/{tasks.length}
                          </span>
                        </div>
                        <ul className="flex-1 divide-y divide-slate-200/70 dark:divide-slate-700/60">
                          {tasks.map((task, index) => {
                            const completed = task.status === 'completed';
                            return (
                              <li
                                key={task.id}
                                className={cn(
                                  'flex items-start gap-3 px-4 py-3.5 transition-colors',
                                  completed && 'bg-emerald-50 dark:bg-emerald-950/30'
                                )}
                              >
                                <button
                                  onClick={() => toggleTask.mutate({ taskId: task.id, done: !completed })}
                                  className={cn(
                                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all lg:h-8 lg:w-8',
                                    completed
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-slate-300 bg-white hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-900'
                                  )}
                                  title={t('display.tapToComplete')}
                                  aria-label={t('display.tapToComplete')}
                                >
                                  {completed && <Check className="h-5 w-5" strokeWidth={3} />}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={cn(
                                      'text-base font-semibold leading-snug text-slate-800 dark:text-slate-100 lg:text-lg',
                                      completed && 'text-slate-400 line-through dark:text-slate-500'
                                    )}
                                  >
                                    <span className="mr-1.5 text-slate-300 dark:text-slate-600">{index + 1}.</span>
                                    {task.title}
                                  </p>
                                  {!isRichTextEmpty(task.description) && !completed && (
                                    <RichTextViewer html={task.description} className="mt-1 text-sm text-slate-500" />
                                  )}
                                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                                    {(task.work_location || task.setup_location) && (
                                      <span className="inline-flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" /> {task.work_location || task.setup_location}
                                      </span>
                                    )}
                                    {task.start_time && (
                                      <span className="inline-flex items-center gap-1 font-semibold">
                                        <Clock className="h-3.5 w-3.5" /> {formatTime(task.start_time, lang)}
                                        {task.completion_time && <> - {formatTime(task.completion_time, lang)}</>}
                                      </span>
                                    )}
                                    {task.assigned_staff && (
                                      <span className="inline-flex items-center gap-1">
                                        <User className="h-3.5 w-3.5" /> {task.assigned_staff}
                                      </span>
                                    )}
                                  </p>
                                  {!isRichTextEmpty(task.notes) && (
                                    <RichTextViewer html={task.notes} className="mt-1 text-sm italic text-slate-400" />
                                  )}
                                  <AttachmentChips files={task.attachments} />
                                  {completed && (
                                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                                      <Check className="h-3 w-3" /> {t('display.completedLabel')}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </DisplayShell>
  );
}
