import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useRequest, useRequestMutations } from '../hooks/useRequests';
import { useDepartments } from '../hooks/useDepartments';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { RichTextEditor } from '../components/editor/RichTextEditor';
import { Spinner } from '../components/ui/Spinner';
import { PRIORITIES, TASK_STATUSES } from '../lib/constants';
import type { Priority, TaskStatus } from '../types';

interface RequestFormValues {
  department_id: string;
  title: string;
  reference: string;
  head_responsible: string;
  location: string;
  request_date: string;
  due_date: string;
  priority: Priority;
  status: TaskStatus;
  description: string;
  notes: string;
}

export function RequestFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { t, deptName } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { data: departments } = useDepartments();
  const { data: existing, isLoading } = useRequest(isEdit ? id : undefined);
  const { createRequest, updateRequest } = useRequestMutations();

  const { register, handleSubmit, control, reset, formState } = useForm<RequestFormValues>({
    defaultValues: {
      department_id: '',
      title: '',
      reference: '',
      head_responsible: '',
      location: '',
      request_date: new Date().toISOString().slice(0, 10),
      due_date: '',
      priority: 'medium',
      status: 'not_started',
      description: '',
      notes: ''
    }
  });

  useEffect(() => {
    if (existing && isEdit) {
      reset({
        department_id: existing.department_id,
        title: existing.title,
        reference: existing.reference,
        head_responsible: existing.head_responsible,
        location: existing.location,
        request_date: existing.request_date,
        due_date: existing.due_date ?? '',
        priority: existing.priority,
        status: existing.status,
        description: existing.description,
        notes: existing.notes
      });
    }
  }, [existing, isEdit, reset]);

  const onSubmit = async (values: RequestFormValues) => {
    const payload = {
      department_id: values.department_id,
      title: values.title.trim(),
      reference: values.reference.trim(),
      head_responsible: values.head_responsible.trim(),
      location: values.location.trim(),
      request_date: values.request_date,
      due_date: values.due_date || null,
      priority: values.priority,
      status: values.status,
      description: values.description,
      notes: values.notes
    };
    try {
      if (isEdit && id) {
        await updateRequest.mutateAsync({ id, ...payload });
        toast(t('common.savedSuccess'));
        navigate(`/requests/${id}`);
      } else {
        const created = await createRequest.mutateAsync({ ...payload, requested_by: profile?.id ?? null });
        toast(t('common.savedSuccess'));
        navigate(`/requests/${created.id}`);
      }
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  if (isEdit && isLoading) return <Spinner />;

  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link to={isEdit && id ? `/requests/${id}` : '/requests'}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> {t('common.back')}</Button>
        </Link>
        <h1 className="text-2xl font-bold text-navy-800 dark:text-white">
          {isEdit ? t('requests.editRequest') : t('requests.newRequest')}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Card>
          <CardHeader><CardTitle>{t('requests.requestDetails')}</CardTitle></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('common.department')}
              required
              error={formState.errors.department_id && t('validation.departmentRequired')}
              {...register('department_id', { required: true })}
              className="sm:col-span-2"
            >
              <option value="">{t('requests.selectDepartment')}</option>
              {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{deptName(d)}</option>)}
            </Select>
            <Input
              label={t('requests.requestTitle')}
              required
              error={formState.errors.title && t('validation.required')}
              {...register('title', { required: true })}
              className="sm:col-span-2"
            />
            <Input label={t('requests.reference')} {...register('reference')} />
            <Input label={t('requests.headResponsible')} {...register('head_responsible')} />
            <Input label={t('common.location')} {...register('location')} className="sm:col-span-2" />
            <Input
              label={t('requests.requestDate')}
              type="date"
              required
              error={formState.errors.request_date && t('validation.dateRequired')}
              {...register('request_date', { required: true })}
            />
            <Input label={t('requests.dueDate')} type="date" {...register('due_date')} />
            <Select label={t('common.priority')} {...register('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </Select>
            <Select label={t('common.status')} {...register('status')}>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>)}
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('requests.jobDetails')}</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('common.description')}
                  </label>
                  <RichTextEditor value={field.value} onChange={field.onChange} />
                </div>
              )}
            />
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('common.notes')} ({t('common.optional')})
                  </label>
                  <RichTextEditor value={field.value} onChange={field.onChange} />
                </div>
              )}
            />
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3 pb-8">
          <Link to={isEdit && id ? `/requests/${id}` : '/requests'}>
            <Button variant="outline" type="button">{t('common.cancel')}</Button>
          </Link>
          <Button type="submit" loading={createRequest.isPending || updateRequest.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
