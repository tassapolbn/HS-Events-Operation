import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, CalendarDays, MapPin, Pencil, Trash2, User } from 'lucide-react';
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
import { formatDate, isRichTextEmpty } from '../lib/utils';
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
            <Button variant="gold" size="sm" onClick={() => setNotifyOpen(true)}>
              <Bell className="h-4 w-4" /> {t('events.notify')}
            </Button>
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
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">{t('requests.requestDate')}</p>
                <p className="font-medium">{formatDate(request.request_date, lang)}</p>
              </div>
            </div>
            {request.due_date && (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">{t('requests.dueDate')}</p>
                  <p className="font-medium">{formatDate(request.due_date, lang)}</p>
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

          {canUpdate && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t('myDept.updateStatus')}:</span>
              <Select value={request.status} onChange={(e) => changeStatus(e.target.value as TaskStatus)} className="w-44">
                {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>)}
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
