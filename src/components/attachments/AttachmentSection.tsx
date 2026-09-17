import { useRef, useState } from 'react';
import { TaskPhotos } from '../display/TaskPhotos';
import { FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon, Trash2, Download, Eye, UploadCloud, ExternalLink } from 'lucide-react';
import { useAttachments, useAttachmentMutations, getSignedUrl, downloadAttachment } from '../../hooks/useAttachments';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Spinner } from '../ui/Spinner';
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE, cn, formatFileSize, getFileKind } from '../../lib/utils';
import type { Attachment, EntityType } from '../../types';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

function kindIcon(mime: string) {
  const kind = getFileKind(mime);
  if (kind === 'image') return <ImageIcon className="h-5 w-5 text-purple-500" />;
  if (kind === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
  if (mime.includes('spreadsheet')) return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
  if (kind === 'office') return <FileText className="h-5 w-5 text-sky-600" />;
  return <FileIcon className="h-5 w-5 text-slate-400" />;
}

interface AttachmentSectionProps {
  entityType: EntityType;
  entityId: string | undefined;
  /** Whether the current user may upload and delete files */
  canManage: boolean;
  compact?: boolean;
}

export function AttachmentSection({ entityType, entityId, canManage, compact }: AttachmentSectionProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data: attachments, isLoading } = useAttachments(entityType, entityId);
  const { upload, remove } = useAttachmentMutations(entityType, entityId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{ attachment: Attachment; url: string } | null>(null);
  const [toDelete, setToDelete] = useState<Attachment | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !profile || !entityId) return;
    for (const file of Array.from(files)) {
      if (!ALLOWED_MIME.has(file.type)) {
        toast(`${file.name}: ${t('attachments.unsupported')}`, 'error');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast(`${file.name}: ${t('attachments.tooLarge')}`, 'error');
        continue;
      }
      try {
        await upload.mutateAsync({ file, userId: profile.id });
      } catch {
        toast(`${file.name}: ${t('attachments.uploadFailed')}`, 'error');
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const openPreview = async (attachment: Attachment) => {
    try {
      const url = await getSignedUrl(attachment.storage_path);
      setPreview({ attachment, url });
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const previewKind = preview ? getFileKind(preview.attachment.mime_type) : null;
  const officeViewerUrl = preview
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(preview.url)}`
    : '';

  return (
    <div className="space-y-3">
      {canManage && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 transition-colors',
            compact ? 'py-4' : 'py-7',
            dragOver
              ? 'border-gold-400 bg-gold-50 dark:bg-gold-950/30'
              : 'border-slate-300 hover:border-navy-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-gold-400 dark:hover:bg-slate-800/50'
          )}
        >
          <UploadCloud className="h-6 w-6 text-slate-400" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {upload.isPending ? t('attachments.uploading') : t('attachments.drop')}
          </p>
          <p className="text-xs text-slate-400">{t('attachments.hint')}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {/* Pictures are shown, not just listed: a photo is attached precisely
          because the words do not say which thing is meant. */}
      {attachments && attachments.length > 0 && (
        <TaskPhotos
          files={attachments}
          size={compact ? 'sm' : 'md'}
          className="mt-0"
          onOpen={(file) => {
            const found = attachments.find((item) => item.id === file.id);
            if (found) void openPreview(found);
          }}
        />
      )}

      {isLoading && entityId ? (
        <Spinner className="py-4" />
      ) : attachments && attachments.length > 0 ? (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
            >
              {kindIcon(attachment.mime_type)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{attachment.file_name}</p>
                <p className="text-xs text-slate-400">{formatFileSize(attachment.size_bytes)}</p>
              </div>
              <button
                onClick={() => openPreview(attachment)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
                title={t('common.preview')}
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                onClick={() => downloadAttachment(attachment)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
                title={t('common.download')}
              >
                <Download className="h-4 w-4" />
              </button>
              {canManage && (
                <button
                  onClick={() => setToDelete(attachment)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                  title={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !canManage && <p className="text-sm italic text-slate-400">{t('attachments.noFiles')}</p>
      )}

      {/* In-app preview */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.attachment.file_name ?? ''}
        size="xl"
        footer={
          preview && (
            <>
              <a href={preview.url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4" /> {t('attachments.openTab')}
                </Button>
              </a>
              <Button size="sm" onClick={() => preview && downloadAttachment(preview.attachment)}>
                <Download className="h-4 w-4" /> {t('common.download')}
              </Button>
            </>
          )
        }
      >
        {preview && (
          <div className="flex min-h-[55vh] items-center justify-center">
            {previewKind === 'image' && (
              <img src={preview.url} alt={preview.attachment.file_name} className="max-h-[70vh] w-auto rounded-xl object-contain" />
            )}
            {previewKind === 'pdf' && (
              <iframe title={preview.attachment.file_name} src={preview.url} className="h-[70vh] w-full rounded-xl border border-slate-200 dark:border-slate-700" />
            )}
            {previewKind === 'office' && (
              <div className="w-full">
                <p className="mb-2 text-center text-xs text-slate-400">{t('attachments.previewNotAvailable')}</p>
                <iframe title={preview.attachment.file_name} src={officeViewerUrl} className="h-[65vh] w-full rounded-xl border border-slate-200 dark:border-slate-700" />
              </div>
            )}
            {previewKind === 'other' && <p className="text-sm text-slate-400">{t('attachments.previewNotAvailable')}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await remove.mutateAsync(toDelete);
            setToDelete(null);
          }
        }}
        title={t('attachments.deleteConfirm')}
        loading={remove.isPending}
      />
    </div>
  );
}
