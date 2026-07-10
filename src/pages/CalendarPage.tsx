import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameMonth, isToday, startOfMonth, startOfWeek
} from 'date-fns';
import { enGB } from 'date-fns/locale/en-GB';
import { th as thLocale } from 'date-fns/locale/th';
import { useEvents } from '../hooks/useEvents';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EventStatusBadge, PriorityBadge } from '../components/ui/Badge';
import { cn, formatTime } from '../lib/utils';
import type { EventWithTasks } from '../types';

type ViewMode = 'month' | 'week' | 'day';

const STATUS_DOT: Record<string, string> = {
  draft: 'bg-slate-400',
  scheduled: 'bg-sky-500',
  active: 'bg-emerald-500',
  completed: 'bg-navy-500',
  archived: 'bg-slate-300'
};

export function CalendarPage() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(new Date());
  const locale = lang === 'th' ? thLocale : enGB;

  const range = useMemo(() => {
    if (view === 'month') {
      return {
        from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
      };
    }
    if (view === 'week') {
      return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    }
    return { from: cursor, to: cursor };
  }, [view, cursor]);

  const { data: events } = useEvents({
    dateFrom: format(range.from, 'yyyy-MM-dd'),
    dateTo: format(range.to, 'yyyy-MM-dd')
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventWithTasks[]>();
    for (const event of events ?? []) {
      const key = event.event_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.event_start ?? '').localeCompare(b.event_start ?? ''));
    }
    return map;
  }, [events]);

  const days = eachDayOfInterval({ start: range.from, end: range.to });

  const move = (dir: 1 | -1) => {
    if (view === 'month') setCursor((c) => addMonths(c, dir));
    else if (view === 'week') setCursor((c) => addWeeks(c, dir));
    else setCursor((c) => addDays(c, dir));
  };

  const heading =
    view === 'month'
      ? format(cursor, 'MMMM yyyy', { locale })
      : view === 'week'
        ? `${format(range.from, 'd MMM', { locale })} - ${format(range.to, 'd MMM yyyy', { locale })}`
        : format(cursor, 'EEEE d MMMM yyyy', { locale });

  const weekdayLabels = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: endOfWeek(new Date(), { weekStartsOn: 1 })
  }).map((d) => format(d, 'EEE', { locale }));

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy-800 dark:text-white">{t('calendar.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  view === mode
                    ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                {t(`calendar.${mode}`)}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>{t('common.today')}</Button>
          <Button variant="outline" size="sm" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => move(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <p className="text-sm font-semibold capitalize text-slate-600 dark:text-slate-300">{heading}</p>

      {view === 'month' && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
            {weekdayLabels.map((label) => (
              <div key={label} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  onClick={() => { setCursor(day); setView('day'); }}
                  className={cn(
                    'min-h-[92px] cursor-pointer border-b border-r border-slate-50 p-1.5 transition-colors last:border-r-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40',
                    !isSameMonth(day, cursor) && 'bg-slate-50/60 dark:bg-slate-900/40'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                      isToday(day)
                        ? 'bg-gold-400 text-navy-900'
                        : isSameMonth(day, cursor)
                          ? 'text-slate-600 dark:text-slate-300'
                          : 'text-slate-300 dark:text-slate-600'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); navigate(`/events/${event.id}`); }}
                        className="flex w-full items-center gap-1 truncate rounded-md bg-navy-50 px-1.5 py-0.5 text-left text-[11px] font-medium text-navy-800 hover:bg-navy-100 dark:bg-navy-900/60 dark:text-navy-100 dark:hover:bg-navy-800"
                      >
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[event.status])} />
                        <span className="truncate">{event.name}</span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="px-1 text-[10px] text-slate-400">+{dayEvents.length - 3}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {view === 'week' && (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <Card key={key} className={cn('p-3', isToday(day) && 'ring-2 ring-gold-400')}>
                <p className="text-xs font-bold uppercase text-slate-400">{format(day, 'EEE', { locale })}</p>
                <p className={cn('text-lg font-bold', isToday(day) ? 'text-gold-500' : 'text-slate-700 dark:text-slate-200')}>
                  {format(day, 'd')}
                </p>
                <div className="mt-2 space-y-1.5">
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => navigate(`/events/${event.id}`)}
                      className="w-full rounded-lg bg-navy-50 px-2 py-1.5 text-left text-xs font-medium text-navy-800 hover:bg-navy-100 dark:bg-navy-900/60 dark:text-navy-100"
                    >
                      <span className="block truncate">{event.name}</span>
                      {event.event_start && <span className="text-[10px] text-slate-400">{formatTime(event.event_start, lang)}</span>}
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === 'day' && (
        <Card className="p-4">
          {(eventsByDay.get(format(cursor, 'yyyy-MM-dd')) ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">{t('calendar.noEvents')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(eventsByDay.get(format(cursor, 'yyyy-MM-dd')) ?? []).map((event) => (
                <li
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className="flex cursor-pointer flex-wrap items-center gap-3 px-2 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="w-16 text-center">
                    <p className="text-sm font-bold text-navy-800 dark:text-gold-300">
                      {event.event_start ? formatTime(event.event_start, lang) : '--:--'}
                    </p>
                    {event.event_finish && (
                      <p className="text-[11px] text-slate-400">{formatTime(event.event_finish, lang)}</p>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{event.name}</p>
                    {event.location && <p className="text-xs text-slate-400">{event.location}</p>}
                  </div>
                  <PriorityBadge priority={event.priority} />
                  <EventStatusBadge status={event.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
