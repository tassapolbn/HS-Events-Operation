import { useState } from 'react';
import { CalendarDays, Check, Inbox, MapPin, Paperclip, User } from 'lucide-react';
import { useSetDisplayRequestStatus } from '../../hooks/usePublicDisplay';
import { showAttachment } from './AttachmentViewer';
import { useLanguage } from '../../i18n';
import { RichTextViewer } from '../editor/RichTextViewer';
import { EmptyState } from '../ui/EmptyState';
import { BoardSkeleton } from './BoardSkeleton';
import { PriorityBadge, TaskStatusBadge } from '../ui/Badge';
import { departmentIcon, PUBLIC_REQUEST_STATUSES, TASK_STATUS_DOTS } from '../../lib/constants';
import { cn, darkenColor, formatDate, isRichTextEmpty } from '../../lib/utils';
import type { DisplayAttachment, DisplayDepartment, DisplayRequest } from '../../types';

interface RequestsBoardProps {
  requests: DisplayRequest[] | undefined;
  departments: DisplayDepartment[];
  selectedDept: string;
  isLoading: boolean;
  /**
   * 'grid'  = square cards in a multi-column grid (the full Requests tab).
   * 'list'  = one card per row, stacked in line (the side-by-side department view,
   *           so requests match the event column on the left).
   */
  layout?: 'grid' | 'list';
}

/** Sort helper: soonest due date first, then anything without a due date. */
function byDueDate(a: DisplayRequest, b: DisplayRequest): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}

export function RequestsBoard({ requests, departments, selectedDept, isLoading, layout = 'grid' }: RequestsBoardProps) {
  const { t, deptName, lang } = useLanguage();
  const setStatus = useSetDisplayRequestStatus();
  // The name typed on each card, used when a status is set from the board.
  const [names, setNames] = useState<Record<string, string>>({});

  // Files open on the board itself, not in another tab
  const openFile = (file: DisplayAttachment, siblings: DisplayAttachment[]) => showAttachment(file, siblings);

  if (isLoading) return <BoardSkeleton cards={2} />;
  // Show the requests with the soonest deadline first, not the submission date.
  const visible = (requests ?? [])
    .filter((request) => !selectedDept || request.department_id === selectedDept)
    .slice()
    .sort(byDueDate);
  if (visible.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <EmptyState icon={Inbox} message={t('display.noRequests')} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid items-start gap-3',
        layout === 'list' ? 'grid-cols-1' : 'lg:grid-cols-2 2xl:grid-cols-3 2xl:gap-4'
      )}
    >
      {visible.map((request) => {
        const dept = departments.find((d) => d.id === request.department_id);
        const Icon = departmentIcon(dept?.icon ?? 'users');
        const completed = request.status === 'completed';
        const signedName =
          request.status === 'completed' ? request.completed_by : request.acknowledged_by;
        return (
          <article
            key={request.id}
            className={cn(
              'animate-slide-up overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900',
              completed && 'opacity-70'
            )}
            style={{ borderLeft: `6px solid ${dept?.color ?? '#1a3c5e'}` }}
          >
            <div className="p-4 2xl:p-6">
              <div className="flex flex-wrap items-start gap-3">
                {dept && (
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${dept.color}1a`, color: dept.color }}
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
                      onClick={() => openFile(file, request.attachments)}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition-transform hover:scale-105 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <Paperclip className="h-3 w-3" /> {file.file_name}
                    </button>
                  ))}
                </div>
              )}

              {/* Status buttons: tap to update, tap the active one again to untick.
                  The name box records who acknowledged or completed the request. */}
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  {t('display.setStatus')}
                </p>

                {signedName && (
                  <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {completed ? t('display.completedBy') : t('display.acknowledgedBy')}: {signedName}
                  </p>
                )}

                <div className="mb-2.5 flex items-center gap-2">
                  <User className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    value={names[request.id] ?? ''}
                    onChange={(e) => setNames((prev) => ({ ...prev, [request.id]: e.target.value }))}
                    placeholder={t('display.namePlaceholder')}
                    aria-label={t('display.yourName')}
                    className="w-full max-w-[16rem] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {PUBLIC_REQUEST_STATUSES.map((status) => {
                    const active = request.status === status;
                    return (
                      <button
                        key={status}
                        onClick={() =>
                          setStatus.mutate({
                            requestId: request.id,
                            // Tapping the active status again reverts it to 'new'.
                            status: active ? 'new' : status,
                            name: (names[request.id] ?? '').trim()
                          })
                        }
                        className={cn(
                          'flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95 2xl:px-3.5 2xl:py-2 2xl:text-sm',
                          active
                            ? 'text-white shadow-md'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        )}
                        style={
                          active
                            ? {
                                background: `linear-gradient(135deg, ${TASK_STATUS_DOTS[status]} 0%, ${darkenColor(TASK_STATUS_DOTS[status])} 100%)`,
                                borderColor: TASK_STATUS_DOTS[status]
                              }
                            : undefined
                        }
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
  );
}
