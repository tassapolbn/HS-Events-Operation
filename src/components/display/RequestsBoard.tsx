import { requestDeadline, scheduleLabel } from '../../lib/requestSchedule';
import { useToast } from '../ui/Toast';
import { useState } from 'react';
import { Clock, Check, CircleCheckBig, Inbox, MapPin, Paperclip, User } from 'lucide-react';
import { inScope, requestIsDone, type BoardScope } from '../../lib/boardScope';
import { useSetDisplayRequestStatus } from '../../hooks/usePublicDisplay';
import { showAttachment } from './AttachmentViewer';
import { useLanguage } from '../../i18n';
import { RichTextViewer } from '../editor/RichTextViewer';
import { EmptyState } from '../ui/EmptyState';
import { BoardSkeleton } from './BoardSkeleton';
import { PriorityBadge, TaskStatusBadge } from '../ui/Badge';
import { departmentIcon, PUBLIC_REQUEST_STATUSES, TASK_STATUS_DOTS } from '../../lib/constants';
import { cn, darkenColor, isRichTextEmpty } from '../../lib/utils';
import type { DisplayAttachment, DisplayDepartment, DisplayRequest } from '../../types';

interface RequestsBoardProps {
  requests: DisplayRequest[] | undefined;
  departments: DisplayDepartment[];
  selectedDept: string;
  isLoading: boolean;
  /** 'active' keeps finished requests out of the way; 'done' shows only those */
  scope?: BoardScope;
  /**
   * 'grid'  = square cards in a multi-column grid (the full Requests tab).
   * 'list'  = one card per row, stacked in line (the side-by-side department view,
   *           so requests match the event column on the left).
   */
  layout?: 'grid' | 'list';
}

/** Sort helper: soonest due date first, then anything without a due date. */
function byDueDate(a: DisplayRequest, b: DisplayRequest): number {
  return requestDeadline(a) - requestDeadline(b) || (a.setup_datetime || '').localeCompare(b.setup_datetime || '');
}

export function RequestsBoard({ requests, departments, selectedDept, isLoading, scope = 'active', layout = 'grid' }: RequestsBoardProps) {
  const { t, deptName, lang } = useLanguage();
  const setStatus = useSetDisplayRequestStatus();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // The name typed on each card, used when a status is set from the board.
  const [names, setNames] = useState<Record<string, string>>({});

  // Files open on the board itself, not in another tab
  const openFile = (file: DisplayAttachment, siblings: DisplayAttachment[]) => showAttachment(file, siblings);

  if (isLoading) return <BoardSkeleton cards={2} />;
  // Show the requests with the soonest deadline first, not the submission date.
  const visible = (requests ?? [])
    .filter((request) => !selectedDept || request.department_id === selectedDept)
    // A finished or cancelled request moves to Done, so the board shows live work only
    .filter((request) => inScope(requestIsDone(request), scope))
    .slice()
    .sort(byDueDate);
  if (visible.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <EmptyState
          icon={scope === 'done' ? CircleCheckBig : Inbox}
          message={scope === 'done' ? t('display.doneRequestsEmpty') : t('display.noRequests')}
        />
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
        const overdue = !requestIsDone(request) && requestDeadline(request) < Date.now();
        const completed = request.status === 'completed';
        const signedName =
          request.status === 'completed' ? request.completed_by : request.acknowledged_by;
        return (
          <article
            key={request.id}
            className={cn(
              'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md',
              overdue && 'border-amber-300'
            )}
            style={{
              borderTop: `4px solid ${dept?.color ?? '#003057'}`
            }}
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
                      'break-words text-lg font-bold leading-snug text-slate-800',
                      completed && 'text-slate-600'
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

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-blue-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-800"><Clock className="h-3.5 w-3.5" />{lang === 'th' ? 'เริ่มดำเนินการ' : 'Work starts'}</p>
                  <p className="mt-1 text-sm font-bold leading-relaxed text-navy-900">{scheduleLabel(request.setup_datetime, lang)}</p>
                </div>
                <div className={cn('rounded-xl p-3', overdue ? 'bg-red-50' : 'bg-amber-50')}>
                  <p className={cn('text-xs font-semibold', overdue ? 'text-red-700' : 'text-amber-800')}>{lang === 'th' ? 'ต้องเสร็จภายใน' : 'Complete by'}{overdue ? (lang === 'th' ? ' · เกินกำหนด' : ' · Overdue') : ''}</p>
                  <p className="mt-1 text-sm font-bold leading-relaxed text-navy-900">{scheduleLabel(request.due_at || request.due_date, lang)}</p>
                  {request.due_date && !request.due_at && <p className="text-xs text-slate-500">{lang === 'th' ? 'ยังไม่ระบุเวลา' : 'Time not specified'}</p>}
                </div>
              </div>
              {request.teardown_datetime && <p className="mt-2 text-xs text-slate-600">{t('requests.teardownTime')}: {scheduleLabel(request.teardown_datetime, lang)}</p>}
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                {request.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" />{request.location}</span>}
                {request.reference && <span>{t('requests.reference')}: {request.reference}</span>}
              </p>

              {!isRichTextEmpty(request.description) && (
                <RichTextViewer html={request.description} className="mt-3 break-words text-[15px] leading-relaxed" />
              )}
              {!isRichTextEmpty(request.notes) && (
                <RichTextViewer html={request.notes} className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600" />
              )}

              {request.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {request.attachments.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => openFile(file, request.attachments)}
                      className="inline-flex min-h-11 max-w-full items-center gap-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
                    >
                      <Paperclip className="h-3 w-3" /> {file.file_name}
                    </button>
                  ))}
                </div>
              )}

              <p className="mt-3 text-[11px] text-slate-400">{lang === 'th' ? 'ลงงาน' : 'Posted'} {scheduleLabel(request.created_at || request.request_date, lang, false)}</p>
              {pendingId === request.id && <p role="status" className="mt-2 text-sm text-slate-600">{lang === 'th' ? 'กำลังบันทึก…' : 'Saving…'}</p>}
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
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {PUBLIC_REQUEST_STATUSES.map((status) => {
                    const active = request.status === status;
                    return (
                      <button
                        key={status}
                        disabled={setStatus.isPending}
                        aria-pressed={active}
                        onClick={() => {
                          setPendingId(request.id);
                          setStatus.mutate({ requestId: request.id, status: active ? 'new' : status, name: (names[request.id] ?? '').trim() }, {
                            onSuccess: () => toast(lang === 'th' ? 'อัปเดตสถานะแล้ว' : 'Status updated'),
                            onError: () => toast(lang === 'th' ? 'อัปเดตไม่สำเร็จ กรุณาลองอีกครั้ง' : 'Could not update. Please try again.', 'error'),
                            onSettled: () => setPendingId(null)
                          });
                        }}
                        className={cn(
                          'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-semibold transition-colors disabled:opacity-60',
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
