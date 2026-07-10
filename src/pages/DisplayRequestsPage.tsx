import { useState } from 'react';
import { CalendarDays, Check, MapPin, Paperclip } from 'lucide-react';
import {
  useDisplayDepartments, useDisplayRequests, useSetDisplayRequestStatus
} from '../hooks/usePublicDisplay';
import { getSignedUrl } from '../hooks/useAttachments';
import { useLanguage } from '../i18n';
import { DisplayShell } from '../components/display/DisplayShell';
import { RichTextViewer } from '../components/editor/RichTextViewer';
import { Spinner } from '../components/ui/Spinner';
import { PriorityBadge, TaskStatusBadge } from '../components/ui/Badge';
import { departmentIcon, PUBLIC_REQUEST_STATUSES, TASK_STATUS_DOTS } from '../lib/constants';
import { cn, formatDate, isRichTextEmpty } from '../lib/utils';
import type { DisplayAttachment } from '../types';

export function DisplayRequestsPage() {
  const { t, deptName, lang } = useLanguage();
  const [selectedDept, setSelectedDept] = useState('');
  const { data: departments } = useDisplayDepartments();
  const { data: requests, isLoading, refetch, isFetching, dataUpdatedAt } = useDisplayRequests();
  const setStatus = useSetDisplayRequestStatus();

  const openFile = async (file: DisplayAttachment) => {
    try {
      const url = await getSignedUrl(file.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch {
      /* ignore on board */
    }
  };

  const visible = (requests ?? []).filter((request) => !selectedDept || request.department_id === selectedDept);

  return (
    <DisplayShell
      title={t('display.requestsTitle')}
      departments={departments ?? []}
      selectedDepartmentId={selectedDept}
      onSelectDepartment={setSelectedDept}
      onRefresh={() => refetch()}
      refreshing={isFetching}
      updatedAt={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
    >
      {isLoading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <p className="py-24 text-center text-xl text-slate-400">{t('display.noRequests')}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 2xl:gap-4">
          {visible.map((request) => {
            const dept = (departments ?? []).find((d) => d.id === request.department_id);
            const Icon = departmentIcon(dept?.icon ?? 'users');
            const completed = request.status === 'completed';
            return (
              <article
                key={request.id}
                className={cn(
                  'overflow-hidden rounded-2xl bg-white shadow-md transition-colors dark:bg-slate-900',
                  completed && 'opacity-75'
                )}
                style={{ borderLeft: `6px solid ${dept?.color ?? '#1a3c5e'}` }}
              >
                <div className="p-4 2xl:p-6">
                  <div className="flex flex-wrap items-start gap-3">
                    {dept && (
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: dept.color }}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3
                        className={cn(
                          'text-base font-extrabold leading-snug text-slate-800 dark:text-slate-100 2xl:text-xl',
                          completed && 'line-through'
                        )}
                      >
                        {request.title}
                      </h3>
                      {dept && (
                        <p className="text-sm font-bold" style={{ color: dept.color }}>
                          {deptName(dept)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={request.priority} />
                      <TaskStatusBadge status={request.status} />
                    </div>
                  </div>

                  <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 2xl:text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" /> {formatDate(request.request_date, lang)}
                    </span>
                    {request.due_date && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-orange-600 dark:text-orange-400">
                        {t('display.due')}: {formatDate(request.due_date, lang)}
                      </span>
                    )}
                    {request.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" /> {request.location}
                      </span>
                    )}
                    {request.reference && <span>{t('requests.reference')}: {request.reference}</span>}
                  </p>

                  {!isRichTextEmpty(request.description) && (
                    <RichTextViewer html={request.description} className="mt-2 text-[15px]" />
                  )}
                  {!isRichTextEmpty(request.notes) && (
                    <RichTextViewer html={request.notes} className="mt-1 text-sm italic text-slate-400" />
                  )}

                  {request.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {request.attachments.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => openFile(file)}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <Paperclip className="h-3 w-3" /> {file.file_name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Status buttons: tap to update, no login needed */}
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                      {t('display.setStatus')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PUBLIC_REQUEST_STATUSES.map((status) => {
                        const active = request.status === status;
                        return (
                          <button
                            key={status}
                            onClick={() => !active && setStatus.mutate({ requestId: request.id, status })}
                            className={cn(
                              'flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition-all 2xl:px-3.5 2xl:py-2 2xl:text-sm',
                              active
                                ? 'text-white shadow'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            )}
                            style={active ? { backgroundColor: TASK_STATUS_DOTS[status], borderColor: TASK_STATUS_DOTS[status] } : undefined}
                          >
                            {active && <Check className="h-4 w-4" strokeWidth={3} />}
                            {t(`taskStatus.${status}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DisplayShell>
  );
}
