import type { MouseEvent } from 'react';
import { cn, isRichTextEmpty, sanitizeHtml } from '../../lib/utils';
import { linkifyHtml } from '../../lib/linkify';

interface RichTextViewerProps {
  html: string;
  className?: string;
  emptyText?: string;
}

/** A click on a link opens the link, not the card or editor around the text */
function keepLinkClicks(event: MouseEvent<HTMLDivElement>) {
  if (event.target instanceof Element && event.target.closest('a')) event.stopPropagation();
}

export function RichTextViewer({ html, className, emptyText }: RichTextViewerProps) {
  if (isRichTextEmpty(html)) {
    return emptyText ? <p className={cn('text-sm italic text-slate-400 dark:text-slate-500', className)}>{emptyText}</p> : null;
  }
  return (
    <div
      className={cn('rich-text text-slate-700 dark:text-slate-200', className)}
      onClick={keepLinkClicks}
      // Addresses pasted as plain text become links too
      dangerouslySetInnerHTML={{ __html: linkifyHtml(sanitizeHtml(html)) }}
    />
  );
}
