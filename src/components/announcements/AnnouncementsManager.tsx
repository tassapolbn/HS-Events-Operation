import { useEffect, useState } from 'react';
import { MonitorPlay, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAnnouncementMutations, useAnnouncements, type AnnouncementInput } from '../../hooks/useAnnouncements';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input, Select, Textarea } from '../ui/Input';
import { AnnouncementBanner } from './AnnouncementBanner';
import {
  addDaysIso, announcementState, bangkokToday, sortAnnouncements, TONES,
  type Announcement, type AnnouncementTone
} from '../../lib/announcements';
import { cn, formatDate } from '../../lib/utils';

const MAX_LENGTH = 1000;

const TONE_BUTTON: Record<AnnouncementTone, string> = {
  info: 'border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100',
  warning: 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
  urgent: 'border-red-600 bg-red-600 text-white'
};

function blankDraft(): AnnouncementInput {
  const today = bangkokToday();
  return { message: '', tone: 'info', starts_on: today, ends_on: addDaysIso(today, 7), show_on_board: false, campus: null };
}

/**
 * Where the Events team writes, edits and removes announcements. Each one
 * shows from its first day to its last, on the Dashboard and, when ticked, on
 * the display board of one campus or both.
 */
export function AnnouncementsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data } = useAnnouncements();
  const { create, update, remove } = useAnnouncementMutations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnouncementInput | null>(null);
  const [noEnd, setNoEnd] = useState(false);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setEditingId(null);
    }
  }, [open]);

  const today = bangkokToday();
  const items = sortAnnouncements((data ?? []).filter((item) => announcementState(item, today) !== 'ended'));

  const startNew = () => {
    setEditingId(null);
    setNoEnd(false);
    setDraft(blankDraft());
  };

  const startEdit = (item: Announcement) => {
    setEditingId(item.id);
    setNoEnd(item.ends_on === null);
    setDraft({
      message: item.message,
      tone: item.tone,
      starts_on: item.starts_on,
      ends_on: item.ends_on ?? addDaysIso(item.starts_on, 7),
      show_on_board: item.show_on_board,
      campus: item.campus
    });
  };

  const patch = (next: Partial<AnnouncementInput>) => setDraft((current) => (current ? { ...current, ...next } : current));

  const message = draft?.message.trim() ?? '';
  const datesWrong = !!draft && !noEnd && !!draft.ends_on && draft.ends_on < draft.starts_on;
  const canSave = !!draft && message.length > 0 && !!draft.starts_on && !datesWrong;

  const save = async () => {
    if (!draft || !canSave || !profile) return;
    const input: AnnouncementInput = { ...draft, message, ends_on: noEnd ? null : draft.ends_on || null };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input });
      else await create.mutateAsync({ input, userId: profile.id });
      toast(t('announcements.saved'));
      setDraft(null);
      setEditingId(null);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const campusLabel = (campus: Announcement['campus']) => (campus ? campus : t('announcements.bothCampuses'));

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('announcements.manage')}
        subtitle={t('announcements.manageHint')}
        size="lg"
        footer={
          draft ? (
            <>
              <Button variant="ghost" onClick={() => { setDraft(null); setEditingId(null); }}>{t('common.cancel')}</Button>
              <Button variant="gold" onClick={save} disabled={!canSave} loading={create.isPending || update.isPending}>
                {t('common.save')}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
          )
        }
      >
        {draft ? (
          <div className="space-y-4" data-announcement-form>
            <Textarea
              label={t('announcements.message')}
              required
              autoFocus
              rows={3}
              maxLength={MAX_LENGTH}
              placeholder={t('announcements.messagePlaceholder')}
              value={draft.message}
              onChange={(event) => patch({ message: event.target.value })}
              hint={`${draft.message.length}/${MAX_LENGTH}`}
            />

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('announcements.tone')}</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('announcements.tone')}>
                {TONES.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    role="radio"
                    aria-checked={draft.tone === tone}
                    onClick={() => patch({ tone })}
                    className={cn(
                      'rounded-xl border-2 px-3.5 py-1.5 text-sm font-semibold transition-colors',
                      draft.tone === tone ? TONE_BUTTON[tone] : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                    )}
                  >
                    {t(`announcements.tone_${tone}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('announcements.startsOn')}
                type="date"
                required
                value={draft.starts_on}
                onChange={(event) => patch({ starts_on: event.target.value })}
              />
              <div className="space-y-1.5">
                <Input
                  label={t('announcements.endsOn')}
                  type="date"
                  disabled={noEnd}
                  min={draft.starts_on}
                  value={noEnd ? '' : draft.ends_on ?? ''}
                  onChange={(event) => patch({ ends_on: event.target.value })}
                  error={datesWrong ? t('announcements.datesWrong') : undefined}
                />
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={noEnd} onChange={(event) => setNoEnd(event.target.checked)} className="h-4 w-4 rounded" />
                  {t('announcements.noEnd')}
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={t('announcements.campus')}
                value={draft.campus ?? ''}
                onChange={(event) => patch({ campus: (event.target.value || null) as AnnouncementInput['campus'] })}
              >
                <option value="">{t('announcements.bothCampuses')}</option>
                <option value="HSC">HSC</option>
                <option value="HSN">HSN</option>
              </Select>
              <label className="flex items-center gap-2.5 self-end rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.show_on_board}
                  onChange={(event) => patch({ show_on_board: event.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <MonitorPlay className="h-4 w-4 text-slate-400" />
                {t('announcements.showOnBoard')}
              </label>
            </div>

            {message && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('announcements.preview')}</p>
                <AnnouncementBanner message={message} tone={draft.tone} />
              </div>
            )}

            {editingId && (
              <button
                type="button"
                onClick={() => {
                  const item = (data ?? []).find((entry) => entry.id === editingId);
                  if (item) setToDelete(item);
                }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline"
              >
                <Trash2 className="h-4 w-4" /> {t('announcements.delete')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button variant="gold" size="sm" onClick={startNew}>
              <Plus className="h-4 w-4" /> {t('announcements.new')}
            </Button>
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
                {t('announcements.empty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => {
                  const state = announcementState(item, today);
                  return (
                    <li key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700" data-announcement-row={item.id}>
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                            item.tone === 'urgent' ? 'bg-red-600' : item.tone === 'warning' ? 'bg-amber-400' : 'bg-sky-400'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 whitespace-pre-line break-words text-sm font-medium text-slate-800 dark:text-slate-100">{item.message}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span
                              className={cn(
                                'rounded-md px-1.5 py-0.5 font-semibold',
                                state === 'active'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              )}
                            >
                              {t(state === 'active' ? 'announcements.active' : 'announcements.upcoming')}
                            </span>
                            <span>
                              {formatDate(item.starts_on, lang, 'd MMM')}
                              {' – '}
                              {item.ends_on ? formatDate(item.ends_on, lang, 'd MMM yyyy') : t('announcements.untilRemoved')}
                            </span>
                            <span>{campusLabel(item.campus)}</span>
                            {item.show_on_board && (
                              <span className="inline-flex items-center gap-1"><MonitorPlay className="h-3 w-3" /> {t('announcements.onBoard')}</span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
                          title={t('common.edit')}
                          aria-label={`${t('common.edit')}: ${item.message.slice(0, 40)}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setToDelete(item)}
                          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                          title={t('announcements.delete')}
                          aria-label={`${t('announcements.delete')}: ${item.message.slice(0, 40)}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-slate-400">{t('announcements.endedHint')}</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
            if (editingId === toDelete.id) {
              setDraft(null);
              setEditingId(null);
            }
          } catch {
            toast(t('common.errorGeneric'), 'error');
          }
          setToDelete(null);
        }}
        title={t('announcements.deleteConfirm')}
        message={toDelete?.message.slice(0, 120)}
        confirmLabel={t('announcements.delete')}
        loading={remove.isPending}
      />
    </>
  );
}
