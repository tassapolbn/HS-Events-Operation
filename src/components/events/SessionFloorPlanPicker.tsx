import { useAttachments, useAttachmentMutations } from '../../hooks/useAttachments';
import { FloorPlanPreview } from '../display/FloorPlanPreview';
import { MAX_FILE_SIZE } from '../../lib/utils';
import { fileType, isAppleMobile, needsConversion, PDF, pictureAccept } from '../../lib/fileTypes';
import { reportProblem } from '../../lib/problemReporting';
import { fileFacts } from '../../lib/problemLog';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';

const PLAN_ACCEPT = pictureAccept(
  typeof navigator !== 'undefined' && isAppleMobile(navigator.userAgent, navigator.maxTouchPoints),
  true
);

export function SessionFloorPlanPicker({ eventId, value, onChange, onUploading }: {
  eventId: string; value: string; onChange: (id: string) => void; onUploading: (busy: boolean) => void;
}) {
  const { data = [] } = useAttachments('event', eventId);
  const { upload } = useAttachmentMutations('event', eventId);
  const { profile } = useAuth();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const plans = data.filter(file => ['image/png', 'image/jpeg', 'application/pdf'].includes(file.mime_type));
  const chosen = plans.find(file => file.id === value);
  return (
    <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:col-span-2 dark:border-teal-900 dark:bg-teal-950/20">
      <label className="block text-sm font-bold" htmlFor="session-floor-plan">{lang === 'th' ? 'แผนผังสำหรับ session นี้' : 'Floor plan for this session'}</label>
      <p className="text-xs text-slate-500">{lang === 'th' ? 'เลือกแผนผังหรืออัปโหลดไฟล์ใหม่ ภาพจะแสดงบน Display board ทันที' : 'Choose a plan or upload a new file. It appears directly on the display board.'}</p>
      <select id="session-floor-plan" value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
        <option value="">{lang === 'th' ? 'ใช้แผนผังรวมของอีเวนท์' : 'Use event floor plans'}</option>
        {plans.map(file => <option key={file.id} value={file.id}>{file.file_name}</option>)}
      </select>
      <label className="block text-xs font-semibold">
        {lang === 'th' ? 'อัปโหลดรูปภาพหรือ PDF (สูงสุด 20 MB)' : 'Upload a picture or PDF (up to 20 MB)'}
        <input type="file" accept={PLAN_ACCEPT} disabled={upload.isPending} className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:text-white" onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || !profile) return;
          const type = fileType(file);
          // Pictures in other formats are turned into JPEG or PNG on the way up
          if (!['image/png', 'image/jpeg', PDF].includes(type) && !needsConversion(type)) {
            toast(t('attachments.unsupported'), 'error');
            reportProblem('upload', `File type not accepted: ${type || 'unknown'}`, fileFacts(file));
            return;
          }
          if (file.size > MAX_FILE_SIZE && !needsConversion(type)) { toast(t('attachments.tooLarge'), 'error'); return; }
          onUploading(true);
          try {
            const attached = await upload.mutateAsync({ file, userId: profile.id });
            onChange(attached.id);
          } catch (error) {
            const unreadable = error instanceof Error && error.name === 'UnreadablePictureError';
            toast(t(unreadable ? 'attachments.cannotConvert' : 'attachments.uploadFailed'), 'error');
          }
          finally { onUploading(false); }
        }} />
      </label>
      {upload.isPending && <p role="status" className="text-sm">{lang === 'th' ? 'กำลังอัปโหลด…' : 'Uploading…'}</p>}
      {chosen && <FloorPlanPreview file={chosen} />}
    </div>
  );
}
