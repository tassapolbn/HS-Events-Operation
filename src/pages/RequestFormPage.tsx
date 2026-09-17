import { bangkokInput, fromBangkokInput, deadlineBeforeWork, scheduleLabel } from '../lib/requestSchedule';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, X } from 'lucide-react';
import { useRequest, useRequestMutations } from '../hooks/useRequests';
import { useDepartments } from '../hooks/useDepartments';
import { useAttachments, useAttachmentMutations } from '../hooks/useAttachments';
import { useAuth } from '../contexts/AuthContext';
import { useCampus } from '../contexts/CampusContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { RichTextEditor } from '../components/editor/RichTextEditor';
import { Spinner } from '../components/ui/Spinner';
import { CAMPUSES, CAMPUS_NAMES, PRIORITIES, REQUEST_STATUSES } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { getSignedUrl } from '../hooks/useAttachments';
import { MAX_FILE_SIZE, randomId } from '../lib/utils';
import type { Attachment, Campus, Priority, TaskStatus } from '../types';

interface RequestFormValues {
  department_id: string;
  campus: Campus;
  title: string;
  reference: string;
  location: string;
  due_date: string;
  due_time: string;
  setup_datetime: string;
  teardown_datetime: string;
  priority: Priority;
  status: TaskStatus;
  description: string;
  notes: string;
}

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

/** Existing image attachment with a resolved preview URL (edit mode) */
function ExistingPhoto({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let mounted = true;
    getSignedUrl(attachment.storage_path).then((signed) => mounted && setUrl(signed)).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [attachment.storage_path]);
  return (
    <div className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
      {url && <img src={url} alt={attachment.file_name} className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function RequestFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { campusFilter } = useCampus();
  const { data: departments } = useDepartments();
  const { data: existing, isLoading } = useRequest(isEdit ? id : undefined);
  const { createRequest, updateRequest } = useRequestMutations();

  // Existing image attachments (edit mode)
  const { data: attachments } = useAttachments('request', isEdit ? id : undefined);
  const { remove: removeAttachment } = useAttachmentMutations('request', isEdit ? id : undefined);
  const existingPhotos = (attachments ?? []).filter((a) => a.mime_type.startsWith('image/'));

  // New photos chosen but not yet uploaded
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, control, reset, setError, clearErrors, formState } = useForm<RequestFormValues>({
    defaultValues: {
      department_id: '',
      campus: campusFilter ?? 'HSC',
      title: '',
      reference: '',
      location: '',
      due_date: '',
      due_time: '',
      setup_datetime: '',
      teardown_datetime: '',
      priority: 'medium',
      status: 'new',
      description: '',
      notes: ''
    }
  });

  useEffect(() => {
    if (existing && isEdit) {
      reset({
        department_id: existing.department_id,
        campus: existing.campus ?? 'HSC',
        title: existing.title,
        reference: existing.reference,
        location: existing.location,
        due_date: existing.due_at ? bangkokInput(existing.due_at).slice(0, 10) : existing.due_date ?? '',
        due_time: bangkokInput(existing.due_at).slice(11, 16),
        setup_datetime: bangkokInput(existing.setup_datetime),
        teardown_datetime: bangkokInput(existing.teardown_datetime),
        priority: existing.priority,
        status: existing.status,
        description: existing.description,
        notes: existing.notes
      });
    }
  }, [existing, isEdit, reset]);

  useEffect(() => {
    return () => pendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next: PendingPhoto[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast(`${file.name}: ${t('attachments.unsupported')}`, 'error');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast(`${file.name}: ${t('attachments.tooLarge')}`, 'error');
        continue;
      }
      next.push({ id: randomId(), file, previewUrl: URL.createObjectURL(file) });
    }
    setPendingPhotos((prev) => [...prev, ...next]);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const removePending = (photoId: string) => {
    setPendingPhotos((prev) => {
      const target = prev.find((photo) => photo.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((photo) => photo.id !== photoId);
    });
  };

  const uploadPendingPhotos = async (requestId: string) => {
    for (const photo of pendingPhotos) {
      const safeName = photo.file.name.replace(/[^\w.\-() ]+/g, '_');
      const path = `request/${requestId}/${randomId()}-${safeName}`;
      const { error: storageError } = await supabase.storage.from('attachments').upload(path, photo.file);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from('attachments').insert({
        entity_type: 'request',
        entity_id: requestId,
        file_name: photo.file.name,
        storage_path: path,
        mime_type: photo.file.type,
        size_bytes: photo.file.size,
        uploaded_by: profile?.id ?? null
      });
      if (rowError) throw rowError;
    }
  };

  const onSubmit = async (values: RequestFormValues) => {
    // Teardown must come after setup when both are provided.
    if (
      values.setup_datetime &&
      values.teardown_datetime &&
      new Date(values.teardown_datetime).getTime() <= new Date(values.setup_datetime).getTime()
    ) {
      setError('teardown_datetime', { type: 'manual', message: t('requests.teardownAfterSetup') });
      return;
    }
    if (values.due_time && !values.due_date) {
      setError('due_date', { message: lang === 'th' ? 'กรุณาระบุวันครบกำหนด' : 'Choose a due date.' });
      return;
    }
    if (deadlineBeforeWork(values.setup_datetime, values.due_date, values.due_time)) {
      setError('due_date', { message: lang === 'th' ? 'กำหนดเสร็จต้องไม่ก่อนเวลาเริ่มงาน' : 'The deadline cannot be before work starts.' });
      return;
    }
    clearErrors(['teardown_datetime', 'due_date']);
    setSaving(true);
    const payload = {
      department_id: values.department_id,
      campus: values.campus,
      title: values.title.trim(),
      reference: values.reference.trim(),
      location: values.location.trim(),
      due_date: values.due_date || null,
      due_at: values.due_date && values.due_time ? fromBangkokInput(`${values.due_date}T${values.due_time}`) : null,
      setup_datetime: fromBangkokInput(values.setup_datetime),
      teardown_datetime: fromBangkokInput(values.teardown_datetime),
      priority: values.priority,
      status: values.status,
      description: values.description,
      notes: values.notes
    };
    try {
      let requestId = id;
      if (isEdit && id) {
        await updateRequest.mutateAsync({ id, ...payload });
      } else {
        const created = await createRequest.mutateAsync({ ...payload, requested_by: profile?.id ?? null });
        requestId = created.id;
      }
      if (requestId && pendingPhotos.length > 0) {
        await uploadPendingPhotos(requestId);
      }
      toast(t('common.savedSuccess'));
      navigate(`/requests/${requestId}`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && isLoading) return <Spinner />;

  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to={isEdit && id ? `/requests/${id}` : '/requests'}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> {t('common.back')}</Button>
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">
          {isEdit ? t('requests.editRequest') : t('requests.newRequest')}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            <Select label={t('campus.label')} {...register('campus')} className="sm:col-span-2">
              {CAMPUSES.map((c) => <option key={c} value={c}>{c} - {CAMPUS_NAMES[c]}</option>)}
            </Select>
            <Input
              label={t('requests.requestTitle')}
              required
              error={formState.errors.title && t('validation.required')}
              {...register('title', { required: true })}
              className="sm:col-span-2"
            />
            <Input label={t('common.location')} {...register('location')} />
            <Input label={t('requests.reference')} {...register('reference')} />
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 sm:col-span-2">
              {lang === 'th' ? 'วันลงงาน: ' : 'Posted: '}{existing ? scheduleLabel(existing.created_at, lang) : (lang === 'th' ? 'บันทึกวันที่ปัจจุบันอัตโนมัติเมื่อกดบันทึก' : 'Recorded automatically when you save')}
              <span className="mt-1 block">{lang === 'th' ? 'กรอกวันเวลาปฏิบัติงานด้านล่าง ทุกเวลาเป็นเวลาไทย' : 'Enter the work schedule below. All times are Thailand time.'}</span>
            </div>
            <Input
              label={t('requests.setupTime')}
              type="datetime-local"
              required={!isEdit}
              error={formState.errors.setup_datetime && t('validation.required')}
              {...register('setup_datetime', { required: !isEdit })}
              className="sm:col-span-2"
            />
            <Input label={t('requests.dueDate')} type="date" error={formState.errors.due_date?.message} {...register('due_date')} />
            <Input label={lang === 'th' ? 'เวลาที่ต้องเสร็จ (ถ้าทราบ)' : 'Due time (if known)'} type="time" {...register('due_time')} />
            <Input
              label={`${t('requests.teardownTime')} (${t('common.optional')})`}
              type="datetime-local"
              error={formState.errors.teardown_datetime?.message}
              {...register('teardown_datetime')}
            />
            <Select label={t('common.priority')} {...register('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </Select>
            <Select label={t('common.status')} {...register('status')}>
              {REQUEST_STATUSES.filter(s => s !== 'cancelled' || existing?.status === 'cancelled').map((s) => <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>)}
            </Select>

            {/* Reference photos: multiple images with preview and removal */}
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('requests.referencePhotos')}
              </label>
              <p className="text-xs text-slate-400">{t('requests.referencePhotosHint')}</p>
              <div className="flex flex-wrap gap-3">
                {existingPhotos.map((photo) => (
                  <ExistingPhoto key={photo.id} attachment={photo} onRemove={() => removeAttachment.mutate(photo)} />
                ))}
                {pendingPhotos.map((photo) => (
                  <div key={photo.id} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <img src={photo.previewUrl} alt={photo.file.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePending(photo.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={t('common.remove')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-navy-400 hover:text-navy-600 dark:border-slate-700 dark:hover:border-gold-400 dark:hover:text-gold-400"
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-[10px] font-semibold">{t('requests.addPhotos')}</span>
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={(e) => addPhotos(e.target.files)}
                />
              </div>
            </div>
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
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
