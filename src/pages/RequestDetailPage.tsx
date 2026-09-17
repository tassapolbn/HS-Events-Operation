import { useSendNotification } from '../hooks/useNotifications';
import { scheduleLabel } from '../lib/requestSchedule';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, CalendarDays, Clock, MapPin, Pencil, Trash2, User, Ban } from 'lucide-react';
import { useRequest, useRequestMutations } from '../hooks/useRequests';
import { useDepartments } from '../hooks/useDepartments';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { PriorityBadge, TaskStatusBadge } from '../components/ui/Badge';
import { Select } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { RichTextViewer } from '../components/editor/RichTextViewer';
import { NotifyModal } from '../components/events/NotifyModal';
import { AuditHistory } from '../components/events/AuditHistory';
import { AttachmentSection } from '../components/attachments/AttachmentSection';
import { departmentIcon, REQUEST_STATUSES } from '../lib/constants';
import { isRichTextEmpty } from '../lib/utils';
import type { TaskStatus } from '../types';

export function RequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { isEventsTeam, profile } = useAuth();

  const { data: request, isLoading, error } = useRequest(id);
  const { data: departments } = useDepartments();
  const { updateRequest, deleteRequest } = useRequestMutations();

  const cancelRequest = useSendNotification();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) return <Spinner />;
  if (error || !request) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-500">{t('errors.loadFailed')}</p>
        <Link to="/requests" className="mt-3 inline-block"><Button variant="outline">{t('common.back')}</Button></Link>
      </div>
    );
  }

  const dept = (departments ?? []).find((d) => d.id === request.department_id);
  const Icon = departmentIcon(dept?.icon ?? 'users');
  const canUpdate = isEventsTeam || (!!profile?.department_id && profile.department_id === request.department_id);

  const changeStatus = async (status: TaskStatus) => {
    if (status === 'cancelled') { setConfirmCancel(true); return; }
    try {
      await updateRequest.mutateAsync({ id: request.id, status });
      toast(t('common.savedSuccess'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/requests">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> {t('common.back')}</Button>
        </Link>
        <div className="min-w-0 flex-1" />
        {isEventsTeam && (
          <div className="flex items-center gap-1.5">
            <Button variant="gold" size="sm" disabled={request.status === 'cancelled'} onClick={() => setNotifyOpen(true)}>
              <Bell className="h-4 w-4" /> {t('events.notify')}
            </Button>
            {request.status !== 'cancelled' && <Button variant="outline" size="sm" className="text-red-700" onClick={() => setConfirmCancel(true)}><Ban className="h-4 w-4" />{lang === 'th' ? 'ยกเลิกงาน' : 'Cancel request'}</Button>}
            <Link to={`/requests/${request.id}/edit`}>
              <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> {t('common.edit')}</Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {request.status === 'cancelled' && <div role="status" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-bold">{lang === 'th' ? 'งานนี้ถูกยกเลิกแล้ว ไม่ต้องดำเนินการต่อ' : 'This request is cancelled. No further work is required.'}</p>
        {isEventsTeam && <Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmCancel(true)}>{lang === 'th' ? 'ส่งแจ้งยกเลิกอีกครั้ง' : 'Resend cancellation notice'}</Button>}
      </div>}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            {dept && (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: dept.color }}>
                <Icon className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-navy-800 dark:text-white">{request.title}</h1>
              {dept && <p className="text-sm font-medium" style={{ color: dept.color }}>{deptName(dept)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <PriorityBadge priority={request.priority} />
              <TaskStatusBadge status={request.status} />
            </div>
          </div>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60 sm:grid-cols-2 lg:grid-cols-3">
            {(request.due_at || request.due_date) && (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">{t('requests.dueDate')}</p>
                  <p className="font-medium">{scheduleLabel(request.due_at || request.due_date, lang)}</p>
                </div>
              </div>
            )}
            {request.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">{t('common.location')}</p>
                  <p className="font-medium">{request.location}</p>
                </div>
              </div>
            )}
            {request.setup_datetime && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">{t('requests.setupTime')}</p>
                  <p className="font-medium">{scheduleLabel(request.setup_datetime, lang)}</p>
                </div>
              </div>
            )}
            {request.teardown_datetime && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">{t('requests.teardownTime')}</p>
                  <p className="font-medium">{scheduleLabel(request.teardown_datetime, lang)}</p>
                </div>
              </div>
            )}
            {request.head_responsible && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">{t('requests.headResponsible')}</p>
                  <p className="font-medium">{request.head_responsible}</p>
                </div>
              </div>
            )}
            {request.reference && (
              <div>
                <p className="text-xs text-slate-400">{t('requests.reference')}</p>
                <p className="font-medium">{request.reference}</p>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">{t('requests.requestDate')}: {scheduleLabel(request.created_at, lang)} · {lang === 'th' ? 'บันทึกอัตโนมัติ' : 'Recorded automatically'}</p>

          {canUpdate && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t('myDept.updateStatus')}:</span>
              <Select value={request.status} onChange={(e) => changeStatus(e.target.value as TaskStatus)} className="w-44">
                {REQUEST_STATUSES.filter(s => s !== 'cancelled' || isEventsTeam || request.status === 'cancelled').map((s) => <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>)}
              </Select>
            </div>
          )}

          {!isRichTextEmpty(request.description) && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('common.description')}</h4>
              <RichTextViewer html={request.description} />
            </section>
          )}
          {!isRichTextEmpty(request.notes) && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('common.notes')}</h4>
              <RichTextViewer html={request.notes} />
            </section>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('common.attachments')}</CardTitle></CardHeader>
        <CardBody>
          <AttachmentSection entityType="request" entityId={request.id} canManage={isEventsTeam} />
        </CardBody>
      </Card>

      {isEventsTeam && <AuditHistory recordId={request.id} />}

      {notifyOpen && dept && (
        <NotifyModal
          open={notifyOpen}
          onClose={() => setNotifyOpen(false)}
          type="request"
          targetId={request.id}
          departments={dept ? [dept] : []}
          suggestedIds={dept ? [dept.id] : []}
        />
      )}
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => { if (!cancelRequest.isPending) setConfirmCancel(false); }}
        title={lang === 'th' ? 'ยืนยันยกเลิกและแจ้งแผนก' : 'Confirm cancellation notice'}
        message={lang === 'th' ? 'ระบบจะยกเลิกงานและส่งอีเมลพร้อมการแจ้งเตือนในระบบให้แผนกที่รับผิดชอบ งานจะไม่แสดงบน Display Board' : 'Cancel this request and notify its assigned department by email and in the app. The request will be removed from the Display Board.'}
        confirmLabel={lang === 'th' ? 'ยืนยันและแจ้งแผนก' : 'Confirm and notify'}
        loading={cancelRequest.isPending}
        onConfirm={async () => {
          try {
            const result = await cancelRequest.mutateAsync({ type: 'request_cancel', id: request.id, retryNotification: request.status === 'cancelled' });
            if (!result.cancelled) throw new Error('Cancellation not confirmed');
            if (result.alreadyCancelled) {
              toast(lang === 'th' ? 'งานถูกยกเลิกแล้ว หากต้องการแจ้งแผนกให้กดส่งแจ้งยกเลิกอีกครั้ง' : 'Already cancelled. Use Resend cancellation notice to notify the department.', 'info');
            } else if (result.results.some(r => r.error)) {
              toast(lang === 'th' ? 'ยกเลิกงานแล้ว แต่แจ้งแผนกไม่ครบ กรุณากดส่งแจ้งยกเลิกอีกครั้ง' : 'Request cancelled, but notification failed. Please resend the cancellation notice.', 'error');
            } else {
              toast(lang === 'th' ? 'ยกเลิกงานและแจ้งแผนกแล้ว' : 'Request cancelled and department notified');
            }
            setConfirmCancel(false);
          } catch {
            toast(lang === 'th' ? 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบสถานะแล้วลองอีกครั้ง' : 'Could not finish. Check the request status and try again.', 'error');
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteRequest.mutateAsync(request.id);
          toast(t('common.deletedSuccess'));
          navigate('/requests');
        }}
        title={t('requests.deleteConfirm')}
        loading={deleteRequest.isPending}
      />
    </div>
  );
}
