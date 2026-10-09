import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, FolderArchive } from 'lucide-react';
import { useLanguage, type TKey } from '../../i18n';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cn, fillTemplate } from '../../lib/utils';
import type { ArchiveReason } from '../../lib/archive';

export type ResultKey = 'archive.archivedCount' | 'archive.restoredCount' | 'archive.deletedCount';

/**
 * Says what really happened after an archive, restore or delete: how many
 * changed, a partial result, or nothing at all. A full success can carry Undo.
 */
export function useArchiveFeedback() {
  const { t } = useLanguage();
  const { toast } = useToast();
  return (changed: number, requested: number, successKey: ResultKey, undo?: () => void) => {
    if (changed === 0) {
      toast(t('archive.nothingChanged'), 'error');
    } else if (changed < requested) {
      toast(fillTemplate(t('archive.partial'), { done: changed, total: requested }), 'info');
    } else {
      toast(fillTemplate(t(successKey), { n: changed }), 'success', undo ? { label: t('archive.undo'), onClick: undo } : undefined);
    }
  };
}

const REASON_KEYS: Record<ArchiveReason, TKey> = {
  completed: 'archive.reasonCompleted',
  cancelled: 'archive.reasonCancelled',
  past: 'archive.reasonPast'
};

export function ArchiveReasonChip({ reason }: { reason: ArchiveReason }) {
  const { t } = useLanguage();
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {t(REASON_KEYS[reason])}
    </span>
  );
}

/** A small Archive button that sits inside a clickable list card without opening it. */
export function ArchiveItemButton({ onArchive, disabled, label }: { onArchive: () => void; disabled?: boolean; label: string }) {
  const { t } = useLanguage();
  const handle = (e: MouseEvent) => {
    e.stopPropagation();
    onArchive();
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-600 transition-colors',
        'hover:border-navy-400 hover:bg-navy-50 hover:text-navy-800 disabled:pointer-events-none disabled:opacity-50',
        'dark:border-slate-700 dark:text-slate-300 dark:hover:border-gold-500 dark:hover:bg-slate-800 dark:hover:text-gold-300'
      )}
    >
      <Archive className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{t('archive.archive')}</span>
    </button>
  );
}

export interface SweepItem {
  id: string;
  label: string;
  reason: ArchiveReason;
}

/**
 * "Archive past & completed": one button that files away everything eligible
 * in the list as it is currently filtered, after showing what will move.
 */
export function ArchiveSweep({
  kind, items, onArchive, busy
}: {
  kind: 'events' | 'requests';
  items: SweepItem[];
  onArchive: (ids: string[]) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const shown = items.slice(0, 8);
  const title = fillTemplate(t(kind === 'events' ? 'archive.sweepEventsTitle' : 'archive.sweepRequestsTitle'), { n: items.length });
  const confirm = async () => {
    await onArchive(items.map((item) => item.id));
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4" />
        <span className="hidden sm:inline">{t('archive.archivePast')}</span>
        <span className="rounded-full bg-navy-100 px-1.5 text-xs font-bold text-navy-800 dark:bg-slate-800 dark:text-gold-300">
          {items.length}
        </span>
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="sm"
        onConfirm={confirm}
        confirmDisabled={busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={confirm} loading={busy}><Archive className="h-4 w-4" /> {t('archive.archive')}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('archive.sweepText')}</p>
        <ul className="mt-3 space-y-1.5">
          {shown.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">{item.label}</span>
              <ArchiveReasonChip reason={item.reason} />
            </li>
          ))}
        </ul>
        {items.length > shown.length && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {fillTemplate(t('archive.andMore'), { n: items.length - shown.length })}
          </p>
        )}
      </Modal>
    </>
  );
}

/** Shown on an archived event or request: why it is not in the lists, and the way back. */
export function ArchivedBanner({
  kind, onRestore, restoring, canRestore
}: {
  kind: 'event' | 'request';
  onRestore: () => void;
  restoring: boolean;
  canRestore: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800/70">
      <FolderArchive className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />
      <p className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        {t(kind === 'event' ? 'archive.eventBanner' : 'archive.requestBanner')}
      </p>
      <div className="flex items-center gap-2">
        <Link to={`/archive?tab=${kind === 'event' ? 'events' : 'requests'}`}>
          <Button variant="ghost" size="sm">{t('archive.openArchive')}</Button>
        </Link>
        {canRestore && (
          <Button variant="outline" size="sm" onClick={onRestore} loading={restoring}>
            <ArchiveRestore className="h-4 w-4" /> {t('archive.restore')}
          </Button>
        )}
      </div>
    </div>
  );
}
