import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, LayoutTemplate, Trash2 } from 'lucide-react';
import { useTemplates, useTemplateMutations } from '../hooks/useTemplates';
import { useDepartments } from '../hooks/useDepartments';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';
import type { EventTemplate } from '../types';

export function TemplatesPage() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: templates, isLoading } = useTemplates();
  const { data: departments } = useDepartments();
  const { deleteTemplate, createEventFromTemplate } = useTemplateMutations();

  const [useTarget, setUseTarget] = useState<EventTemplate | null>(null);
  const [newDate, setNewDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EventTemplate | null>(null);

  const createFromTemplate = async () => {
    if (!useTarget || !newDate || !profile || !departments) return;
    try {
      const eventId = await createEventFromTemplate.mutateAsync({
        template: useTarget,
        eventDate: newDate,
        departments,
        userId: profile.id
      });
      setUseTarget(null);
      setNewDate('');
      navigate(`/events/${eventId}`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">{t('templates.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('templates.subtitle')}</p>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !templates || templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} message={t('templates.noTemplates')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardBody className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-gold-300">
                    <LayoutTemplate className="h-5 w-5" />
                  </span>
                  <button
                    onClick={() => setDeleteTarget(template)}
                    className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                    title={t('templates.deleteTemplate')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{template.name}</h3>
                  {template.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{template.description}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {template.data.tasks.length} {t('templates.tasksIncluded')}
                    {(template.data.sessions?.length ?? 0) > 0 &&
                      ` - ${template.data.sessions?.length} ${t('templates.sessionsIncluded')}`}
                    {' - '}
                    {formatDate(template.created_at, lang, 'd MMM yyyy')}
                  </p>
                </div>
                <Button variant="gold" size="sm" onClick={() => { setUseTarget(template); setNewDate(''); }}>
                  <CalendarPlus className="h-4 w-4" /> {t('templates.useTemplate')}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!useTarget}
        onClose={() => setUseTarget(null)}
        title={useTarget?.name ?? ''}
        subtitle={t('templates.newEventDate')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setUseTarget(null)}>{t('common.cancel')}</Button>
            <Button onClick={createFromTemplate} disabled={!newDate} loading={createEventFromTemplate.isPending}>
              {createEventFromTemplate.isPending ? t('templates.creating') : t('templates.createEvent')}
            </Button>
          </>
        }
      >
        <Input label={t('templates.newEventDate')} type="date" required value={newDate} onChange={(e) => setNewDate(e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteTemplate.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
            toast(t('common.deletedSuccess'));
          }
        }}
        title={t('templates.deleteConfirm')}
        loading={deleteTemplate.isPending}
      />
    </div>
  );
}
