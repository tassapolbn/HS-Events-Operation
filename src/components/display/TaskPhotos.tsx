import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { forgetSignedUrl, useSignedUrl } from '../../hooks/useAttachments';
import { useLanguage } from '../../i18n';
import { showAttachment } from './AttachmentViewer';
import { cn } from '../../lib/utils';
import type { DisplayAttachment } from '../../types';

export function isImage(file: { mime_type: string }): boolean {
  return file.mime_type.startsWith('image/');
}

/**
 * A photo attached to a job, shown as a picture rather than a file name.
 * "Carry the red table in the atrium" is a guess until someone sees the table,
 * so the picture belongs where the instruction is, not one tap away behind it.
 *
 * The bucket is private, so the link is signed. The same link is reused for
 * days, so the browser downloads each picture once instead of at every renewal.
 */
function Thumb({ file, siblings, size, onOpen }: {
  file: DisplayAttachment;
  siblings: DisplayAttachment[];
  size: 'sm' | 'md';
  onOpen?: (file: DisplayAttachment) => void;
}) {
  const { lang } = useLanguage();
  const url = useSignedUrl(file.storage_path);
  // A link that stopped working is replaced once; after that the tile says so
  const [failures, setFailures] = useState(0);
  const box = size === 'sm' ? 'h-20 w-28' : 'h-32 w-44';

  if (url.isError || failures > 1) {
    return (
      <span
        className={cn('flex shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800', box)}
        title={file.file_name}
      >
        <ImageOff className="h-4 w-4" /> {lang === 'th' ? 'เปิดรูปไม่ได้' : 'No preview'}
      </span>
    );
  }
  if (!url.data) {
    return <span className={cn('shrink-0 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800', box)} aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      data-task-photo={file.id}
      onClick={(event) => {
        event.stopPropagation();
        if (onOpen) onOpen(file);
        else showAttachment(file, siblings);
      }}
      title={file.file_name}
      aria-label={file.file_name}
      className={cn(
        'shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white transition-transform hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-slate-800',
        box
      )}
    >
      <img
        src={url.data}
        alt={file.file_name}
        loading="lazy"
        className="h-full w-full object-cover"
        onLoad={() => {
          if (failures) setFailures(0);
        }}
        onError={() => {
          if (failures === 0) {
            forgetSignedUrl(file.storage_path);
            void url.refetch();
          }
          setFailures((count) => count + 1);
        }}
      />
    </button>
  );
}

/** Every picture on a job, side by side. Files that are not pictures stay as chips. */
export function TaskPhotos({
  files,
  size = 'sm',
  className,
  onOpen
}: {
  files: DisplayAttachment[];
  size?: 'sm' | 'md';
  className?: string;
  /** The board opens its own viewer; behind the login the page opens its own */
  onOpen?: (file: DisplayAttachment) => void;
}) {
  const photos = files.filter(isImage);
  if (photos.length === 0) return null;
  return (
    <span className={cn('mt-1.5 flex basis-full flex-wrap gap-2', className)}>
      {photos.map((file) => (
        <Thumb key={file.id} file={file} siblings={photos} size={size} onOpen={onOpen} />
      ))}
    </span>
  );
}
