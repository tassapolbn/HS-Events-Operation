import { cn, isRichTextEmpty, sanitizeHtml } from '../../lib/utils';

interface RichTextViewerProps {
  html: string;
  className?: string;
  emptyText?: string;
}

export function RichTextViewer({ html, className, emptyText }: RichTextViewerProps) {
  if (isRichTextEmpty(html)) {
    return emptyText ? <p className={cn('text-sm italic text-slate-400 dark:text-slate-500', className)}>{emptyText}</p> : null;
  }
  return (
    <div
      className={cn('rich-text text-slate-700 dark:text-slate-200', className)}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}
