import { useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, ShieldAlert, Smartphone, Timer } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { useCalendarFeedKey, useRotateCalendarFeedKey } from '../../hooks/useCalendarFeed';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../ui/Toast';
import { CAMPUS_NAMES } from '../../lib/constants';
import { calendarFeedUrl, FEED_CAMPUSES, googleCalendarAddUrl, webcalUrl, type FeedCampus } from '../../lib/calendarFeedLinks';
import { fillTemplate } from '../../lib/utils';

/**
 * Each campus's calendar link, to add to Google Calendar (or Apple Calendar
 * and Outlook) once. The Events team can replace the links if one has been
 * shared too widely.
 */
export function CalendarFeedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { isEventsTeam } = useAuth();
  const { toast } = useToast();
  const feedKey = useCalendarFeedKey(open);
  const rotate = useRotateCalendarFeedKey();
  const [confirmNew, setConfirmNew] = useState(false);
  const [copied, setCopied] = useState<FeedCampus | null>(null);

  const copy = async (campus: FeedCampus, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(campus);
      window.setTimeout(() => setCopied((current) => (current === campus ? null : current)), 2500);
    } catch {
      // No clipboard access: select the link so it can be copied by hand
      const input = document.getElementById(`calendar-feed-${campus}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
      toast(t('calendarFeed.copyByHand'), 'info');
    }
  };

  const key = feedKey.data?.key;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('calendarFeed.title')}
        subtitle={t('calendarFeed.subtitle')}
        size="lg"
        footer={<Button variant="outline" onClick={onClose}>{t('common.close')}</Button>}
      >
        {feedKey.isLoading ? (
          <div className="py-8"><Spinner /></div>
        ) : !key ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('calendarFeed.notReady')}</p>
        ) : (
          <div className="space-y-4">
            {FEED_CAMPUSES.map((campus) => {
              const url = calendarFeedUrl(window.location.origin, campus, key, lang);
              return (
                <section key={campus} data-feed-campus={campus} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    <span className="mr-1.5 rounded-md bg-navy-800 px-1.5 py-0.5 text-[11px] font-extrabold text-white dark:bg-gold-400 dark:text-navy-900">{campus}</span>
                    {CAMPUS_NAMES[campus]}
                  </h3>
                  <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      id={`calendar-feed-${campus}`}
                      readOnly
                      value={url}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label={fillTemplate(t('calendarFeed.campusLink'), { campus: CAMPUS_NAMES[campus] })}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    <Button variant="outline" size="md" onClick={() => void copy(campus, url)} className="shrink-0">
                      {copied === campus ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      {copied === campus ? t('calendarFeed.copied') : t('calendarFeed.copy')}
                    </Button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <a
                      href={googleCalendarAddUrl(url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gold-400 px-3.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-300"
                    >
                      <ExternalLink className="h-4 w-4" /> {t('calendarFeed.addGoogle')}
                    </a>
                    <a
                      href={webcalUrl(url)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Smartphone className="h-4 w-4" /> {t('calendarFeed.addOther')}
                    </a>
                  </div>
                </section>
              );
            })}

            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <p className="font-semibold text-slate-700 dark:text-slate-200">{t('calendarFeed.stepsTitle')}</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5">
                <li>{t('calendarFeed.step1')}</li>
                <li>{t('calendarFeed.step2')}</li>
                <li>{t('calendarFeed.step3')}</li>
              </ol>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('calendarFeed.langNote')}</p>
            </div>

            <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Timer className="mt-0.5 h-4 w-4 shrink-0" /> {t('calendarFeed.delay')}
            </p>
            <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {t('calendarFeed.private')}
            </p>

            {isEventsTeam && (
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('calendarFeed.newLinksHint')}</p>
                <Button variant="outline" size="sm" onClick={() => setConfirmNew(true)} className="shrink-0">
                  <KeyRound className="h-4 w-4" /> {t('calendarFeed.newLinks')}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        onConfirm={async () => {
          try {
            await rotate.mutateAsync();
            toast(t('calendarFeed.newLinksDone'));
          } catch {
            toast(t('common.errorGeneric'), 'error');
          }
          setConfirmNew(false);
        }}
        title={t('calendarFeed.newLinksConfirm')}
        message={t('calendarFeed.newLinksWarning')}
        confirmLabel={t('calendarFeed.newLinks')}
        loading={rotate.isPending}
      />
    </>
  );
}
