import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Wrench, X } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { prepLabel, type CalendarEntry, type DayAlert } from '../../lib/calendarDays';
import { cn, fillTemplate } from '../../lib/utils';
import { prepWords } from './calendarWords';

/** How many items a day lists before "+n more" */
const MAX_PER_DAY = { app: 4, board: 6 };

/**
 * "Today: Yearbook Photoshoot | Tomorrow: Setup · Wai Khru".
 *
 * The back office shows it under the top bar, where each item opens its event.
 * The display board shows it larger, above the work, as plain text.
 */
export function DayAlertBar({
  alerts,
  size = 'app',
  linkFor,
  moreHref,
  onHide
}: {
  alerts: DayAlert[];
  size?: 'app' | 'board';
  /** Where an item leads. Without it the items are plain text. */
  linkFor?: (entry: CalendarEntry) => string;
  /** Where "+n more" leads */
  moreHref?: string;
  onHide?: () => void;
}) {
  const { t } = useLanguage();
  if (alerts.length === 0) return null;
  const board = size === 'board';
  const words = prepWords(t);

  const item = (entry: CalendarEntry): ReactNode => {
    const prep = entry.kind === 'prep';
    const dayOf =
      entry.kind === 'event' && entry.dayCount > 1
        ? fillTemplate(t('calendar.dayOf'), { n: entry.dayIndex, total: entry.dayCount })
        : null;
    const content = (
      <>
        {prep && <Wrench className={cn('shrink-0', board ? 'h-4 w-4' : 'h-3.5 w-3.5')} aria-hidden="true" />}
        {prep && <span className="font-semibold">{prepLabel(entry, words)} ·</span>}
        <span className="font-bold">{entry.event.name}</span>
        {dayOf && <span className="font-medium opacity-75">({dayOf})</span>}
        {entry.time && <span className="font-semibold tabular-nums opacity-75">{entry.time}</span>}
      </>
    );
    const className = cn(
      'inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1',
      prep && 'text-amber-800 dark:text-amber-200'
    );
    const href = linkFor?.(entry);
    return href ? (
      <Link
        to={href}
        data-day-alert-item={entry.kind}
        className={cn(className, 'rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500')}
      >
        {content}
      </Link>
    ) : (
      <span data-day-alert-item={entry.kind} className={className}>
        {content}
      </span>
    );
  };

  const days = alerts.map((alert, index) => {
    const shown = alert.entries.slice(0, MAX_PER_DAY[size]);
    const more = alert.entries.length - shown.length;
    return (
      <Fragment key={alert.day}>
        {index > 0 && (
          <span aria-hidden="true" className={cn('hidden w-px self-stretch sm:block', board ? 'bg-gold-300' : 'bg-gold-300 dark:bg-gold-800')} />
        )}
        <p
          data-day-alert={alert.offset === 0 ? 'today' : 'tomorrow'}
          className={cn('flex min-w-0 flex-wrap items-center', board ? 'gap-x-2.5 gap-y-1.5' : 'gap-x-2 gap-y-1')}
        >
          <span
            className={cn(
              'shrink-0 rounded-md font-extrabold uppercase tracking-wide',
              board ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]',
              alert.offset === 0 ? 'bg-gold-400 text-navy-900' : 'bg-navy-800 text-white dark:bg-navy-600'
            )}
          >
            {alert.offset === 0 ? t('dayAlerts.today') : t('dayAlerts.tomorrow')}
          </span>
          {shown.map((entry, position) => (
            <Fragment key={entry.key}>
              {position > 0 && <span aria-hidden="true" className="text-slate-400">·</span>}
              {item(entry)}
            </Fragment>
          ))}
          {more > 0 &&
            (moreHref ? (
              <Link to={moreHref} className="font-semibold text-navy-700 underline-offset-2 hover:underline dark:text-gold-300">
                {fillTemplate(t('dayAlerts.more'), { n: more })}
              </Link>
            ) : (
              <span className="font-semibold text-slate-500">{fillTemplate(t('dayAlerts.more'), { n: more })}</span>
            ))}
        </p>
      </Fragment>
    );
  });

  if (board) {
    return (
      <section
        aria-label={t('dayAlerts.label')}
        data-day-alerts
        className="mb-5 flex items-start gap-3 rounded-2xl border border-gold-300 bg-white px-4 py-3 text-base text-navy-900 shadow-sm sm:px-5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-navy-900">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">{days}</div>
      </section>
    );
  }

  return (
    <section
      aria-label={t('dayAlerts.label')}
      data-day-alerts
      className="no-print border-b border-gold-200 bg-gold-50 text-sm text-navy-900 dark:border-gold-900/50 dark:bg-gold-950/30 dark:text-gold-50"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-2.5 px-4 py-2 lg:px-8">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-gold-600 dark:text-gold-400" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">{days}</div>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            title={t('dayAlerts.hide')}
            aria-label={t('dayAlerts.hide')}
            className="-my-0.5 shrink-0 rounded-lg p-1 text-gold-700 transition-colors hover:bg-gold-100 dark:text-gold-300 dark:hover:bg-gold-900/40"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}
