import { Bell, ChevronDown, ChevronUp, CopyPlus, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useSessionMutations } from '../../hooks/useSessions';
import { canReorder, reorderWithinDay } from '../../lib/sessionOrder';
import { cn } from '../../lib/utils';
import type { EventSession } from '../../types';

interface SessionControlsProps {
  session: EventSession;
  /** Every session of this event, so a move knows its neighbours on the same day */
  sessions: EventSession[];
  /** 'dark' sits on the navy session bar, 'light' on a white chip */
  tone: 'dark' | 'light';
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Opens the dialog that emails this session's new work to the departments */
  onNotify?: () => void;
  /** Jobs in this session that no department has been told about yet */
  unsentCount?: number;
}

/**
 * The controls that belong to one session: order it inside its day, take it off
 * the display board, copy it, edit it, delete it. Used on the session bar and on
 * the session chips under the worksheet, so both stay in step.
 */
export function SessionControls({
  session, sessions, tone, onDuplicate, onEdit, onDelete, onNotify, unsentCount = 0
}: SessionControlsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { reorderSessions, setSessionHidden } = useSessionMutations(session.event_id);
  const hidden = session.is_hidden === true;
  const busy = reorderSessions.isPending || setSessionHidden.isPending;

  const button =
    tone === 'dark'
      ? 'rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'
      : 'rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-gold-300';
  const danger =
    tone === 'dark'
      ? 'rounded-lg p-1.5 text-white/70 transition-colors hover:bg-red-500/40 hover:text-white'
      : 'rounded-md p-1 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/50';
  const size = tone === 'dark' ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5';

  const move = async (direction: -1 | 1) => {
    const rows = reorderWithinDay(sessions, session.id, direction);
    if (rows.length === 0) return;
    try {
      await reorderSessions.mutateAsync(rows);
      toast(t('sessions.reordered'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const toggleHidden = async () => {
    try {
      await setSessionHidden.mutateAsync({ id: session.id, hidden: !hidden });
      toast(hidden ? t('sessions.nowVisible') : t('sessions.nowHidden'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <span className="flex items-center gap-0.5">
      {onNotify && (
        <button
          type="button"
          onClick={onNotify}
          className={cn(button, 'relative', unsentCount > 0 && (tone === 'dark' ? '!text-gold-300' : '!text-gold-600'))}
          title={`${t('notify.sessionBell')}${unsentCount > 0 ? ` · ${unsentCount} ${t('notify.sessionBellCount')}` : ''}`}
          aria-label={t('notify.sessionBell')}
        >
          <Bell className={size} />
          {/* The count is the point: it says how much the departments have not heard about */}
          {unsentCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-gold-500 px-1 text-[0.55rem] font-extrabold tabular-nums text-navy-900">
              {unsentCount > 9 ? '9+' : unsentCount}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={() => void move(-1)}
        disabled={busy || !canReorder(sessions, session.id, -1)}
        className={button}
        title={`${t('sessions.moveUp')} · ${t('sessions.reorderHint')}`}
        aria-label={t('sessions.moveUp')}
      >
        <ChevronUp className={size} />
      </button>
      <button
        type="button"
        onClick={() => void move(1)}
        disabled={busy || !canReorder(sessions, session.id, 1)}
        className={button}
        title={`${t('sessions.moveDown')} · ${t('sessions.reorderHint')}`}
        aria-label={t('sessions.moveDown')}
      >
        <ChevronDown className={size} />
      </button>
      <button
        type="button"
        onClick={() => void toggleHidden()}
        disabled={busy}
        aria-pressed={hidden}
        className={cn(button, hidden && (tone === 'dark' ? '!text-gold-300' : '!text-amber-600'))}
        title={`${hidden ? t('sessions.showOnBoard') : t('sessions.hideFromBoard')} · ${t('sessions.hiddenHint')}`}
        aria-label={hidden ? t('sessions.showOnBoard') : t('sessions.hideFromBoard')}
      >
        {hidden ? <EyeOff className={size} /> : <Eye className={size} />}
      </button>
      <button type="button" onClick={onDuplicate} className={button} title={t('sessions.duplicateSession')} aria-label={t('sessions.duplicateSession')}>
        <CopyPlus className={size} />
      </button>
      <button type="button" onClick={onEdit} className={button} title={t('sessions.editSession')} aria-label={t('sessions.editSession')}>
        <Pencil className={size} />
      </button>
      <button type="button" onClick={onDelete} className={danger} title={t('sessions.deleteSession')} aria-label={t('sessions.deleteSession')}>
        <Trash2 className={size} />
      </button>
    </span>
  );
}

/** The badge that marks a session the display board is not showing. */
export function HiddenSessionBadge({ tone }: { tone: 'dark' | 'light' }) {
  const { t } = useLanguage();
  return (
    <span
      title={t('sessions.hiddenHint')}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.7rem] font-extrabold',
        tone === 'dark' ? 'bg-gold-400 text-navy-900' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
      )}
    >
      <EyeOff className="h-3 w-3" /> {t('sessions.hiddenOnBoard')}
    </span>
  );
}
