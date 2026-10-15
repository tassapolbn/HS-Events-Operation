import type { ReactNode } from 'react';
import { AlertTriangle, Megaphone, Siren, X } from 'lucide-react';
import { LinkifiedText } from '../ui/LinkifiedText';
import { cn } from '../../lib/utils';
import type { AnnouncementTone } from '../../lib/announcements';

const TONE: Record<AnnouncementTone, { box: string; icon: string; link: string; Icon: typeof Megaphone }> = {
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
    icon: 'text-sky-600 dark:text-sky-300',
    link: 'break-all font-semibold underline decoration-sky-400 underline-offset-2',
    Icon: Megaphone
  },
  warning: {
    box: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
    icon: 'text-amber-600 dark:text-amber-300',
    link: 'break-all font-semibold underline decoration-amber-500 underline-offset-2',
    Icon: AlertTriangle
  },
  urgent: {
    box: 'border-red-700 bg-red-600 text-white',
    icon: 'text-white',
    link: 'break-all font-bold underline decoration-white/60 underline-offset-2',
    Icon: Siren
  }
};

/**
 * One announcement. The same look on the Dashboard and on the display board,
 * where it is larger because the board is read from across a room.
 */
export function AnnouncementBanner({
  message,
  tone,
  size = 'app',
  meta,
  onDismiss,
  dismissLabel
}: {
  message: string;
  tone: AnnouncementTone;
  size?: 'app' | 'board';
  meta?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const style = TONE[tone] ?? TONE.info;
  return (
    <div
      role={tone === 'urgent' ? 'alert' : 'status'}
      data-announcement={tone}
      className={cn(
        'flex items-start gap-3 rounded-2xl border shadow-sm',
        size === 'board' ? 'px-5 py-4 text-lg font-bold' : 'px-4 py-3 text-sm font-medium',
        style.box
      )}
    >
      <style.Icon className={cn('mt-0.5 shrink-0', size === 'board' ? 'h-6 w-6' : 'h-5 w-5', style.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words">
          <LinkifiedText text={message} linkClassName={style.link} />
        </p>
        {meta && <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium opacity-80')}>{meta}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
          title={dismissLabel}
          aria-label={dismissLabel}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
