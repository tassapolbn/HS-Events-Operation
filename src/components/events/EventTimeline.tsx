import { Check } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { cn, extractDate, formatDate, formatTime } from '../../lib/utils';
import type { EventRow } from '../../types';

const MILESTONES = [
  { field: 'setup_start', key: 'timeline.setupBegins' },
  { field: 'venue_ready', key: 'timeline.venueReady' },
  { field: 'event_start', key: 'timeline.eventStarts' },
  { field: 'event_finish', key: 'timeline.eventEnds' },
  { field: 'breakdown_start', key: 'timeline.breakdownBegins' },
  { field: 'breakdown_deadline', key: 'timeline.breakdownComplete' }
] as const;

export function EventTimeline({ event }: { event: EventRow }) {
  const { t, lang } = useLanguage();
  const now = Date.now();

  const items = MILESTONES.map((m) => {
    const value = event[m.field] as string | null;
    const sameDay = !value || extractDate(value) === event.event_date;
    return {
      label: t(m.key),
      time: value,
      display: value
        ? sameDay
          ? formatTime(value, lang)
          : `${formatDate(value, lang, 'd MMM')} ${formatTime(value, lang)}`
        : '-',
      passed: value ? new Date(value).getTime() <= now : false
    };
  });

  const anyTime = items.some((item) => item.time);
  if (!anyTime) return null;

  return (
    <div>
      {/* Desktop: horizontal */}
      <ol className="hidden items-start md:flex">
        {items.map((item, index) => (
          <li key={item.label} className="relative flex-1">
            {index < items.length - 1 && (
              <span
                className={cn(
                  'absolute left-1/2 top-[13px] h-0.5 w-full',
                  items[index + 1].passed ? 'bg-gold-400' : 'bg-slate-200 dark:bg-slate-700'
                )}
              />
            )}
            <div className="relative flex flex-col items-center gap-1.5 px-1 text-center">
              <span
                className={cn(
                  'z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors',
                  item.passed
                    ? 'border-gold-400 bg-gold-400 text-navy-900'
                    : 'border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900'
                )}
              >
                {item.passed ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="text-[11px] font-semibold leading-tight text-slate-600 dark:text-slate-300">{item.label}</span>
              <span className={cn('text-xs font-bold', item.passed ? 'text-navy-800 dark:text-gold-300' : 'text-slate-400')}>
                {item.display}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {/* Mobile: vertical */}
      <ol className="space-y-0 md:hidden">
        {items.map((item, index) => (
          <li key={item.label} className="relative flex gap-3 pb-4 last:pb-0">
            {index < items.length - 1 && (
              <span
                className={cn(
                  'absolute left-[13px] top-7 h-full w-0.5',
                  items[index + 1].passed ? 'bg-gold-400' : 'bg-slate-200 dark:bg-slate-700'
                )}
              />
            )}
            <span
              className={cn(
                'z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                item.passed
                  ? 'border-gold-400 bg-gold-400 text-navy-900'
                  : 'border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900'
              )}
            >
              {item.passed ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className="flex flex-1 items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
              <span className={cn('text-sm font-bold', item.passed ? 'text-navy-800 dark:text-gold-300' : 'text-slate-400')}>
                {item.display}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
