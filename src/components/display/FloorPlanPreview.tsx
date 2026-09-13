import { useQuery } from '@tanstack/react-query';
import { Map, Maximize2, RefreshCw } from 'lucide-react';
import { getSignedUrl } from '../../hooks/useAttachments';
import { useLanguage } from '../../i18n';
import { showAttachment } from './AttachmentViewer';
import type { DisplayAttachment } from '../../types';

/** Cached, renewable URLs keep unattended boards working beyond one hour. */
export function FloorPlanPreview({ file, label }: { file: DisplayAttachment; label?: string }) {
  const { t, lang } = useLanguage();
  const url = useQuery({
    queryKey: ['floor-plan-url', file.storage_path],
    queryFn: () => getSignedUrl(file.storage_path),
    staleTime: 45 * 60_000,
    refetchInterval: 45 * 60_000,
    refetchIntervalInBackground: true
  });
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" data-floor-plan={file.id}>
      <figcaption className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800">
        <Map className="h-4 w-4 shrink-0 text-teal-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{label || t('display.floorPlan')}</p>
          <p className="truncate text-xs text-slate-500">{file.file_name}</p>
        </div>
        <button type="button" onClick={() => showAttachment(file)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-teal-500" aria-label={t('display.viewFloorPlan')}>
          <Maximize2 className="h-4 w-4" />
        </button>
      </figcaption>
      {url.isError ? (
        <button type="button" onClick={() => void url.refetch()} className="flex min-h-40 w-full items-center justify-center gap-2 p-6 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4" />{lang === 'th' ? 'โหลดแผนผังอีกครั้ง' : 'Retry loading floor plan'}
        </button>
      ) : !url.data ? (
        <div className="h-64 animate-pulse bg-slate-100 dark:bg-slate-800" aria-label={lang === 'th' ? 'กำลังโหลดแผนผัง' : 'Loading floor plan'} />
      ) : file.mime_type === 'application/pdf' ? (
        <iframe title={`${label || t('display.floorPlan')}: ${file.file_name}`} src={`${url.data}#view=FitH`} className="h-[420px] w-full border-0 bg-white" />
      ) : (
        <button type="button" className="block w-full bg-white p-2 focus-visible:ring-2 focus-visible:ring-teal-500" onClick={() => showAttachment(file)} aria-label={t('display.viewFloorPlan')}>
          <img src={url.data} alt={`${label || t('display.floorPlan')}: ${file.file_name}`} className="max-h-[480px] min-h-40 w-full object-contain" onError={(event) => { event.currentTarget.alt = lang === 'th' ? 'ไม่สามารถแสดงภาพแผนผังได้ กดเพื่อเปิดไฟล์' : 'Floor plan image unavailable. Select to open file.'; }} />
        </button>
      )}
    </figure>
  );
}
