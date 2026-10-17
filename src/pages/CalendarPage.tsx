import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameMonth, isToday, startOfMonth, startOfWeek
} from 'date-fns';
import { enGB } from 'date-fns/locale/en-GB';
import { th as thLocale } from 'date-fns/locale/th';
import { useCalendarData } from '../hooks/useCalendar';
import { useCampus } from '../contexts/CampusContext';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EventStatusBadge } from '../components/ui/Badge';
import { buildCalendarDays, prepLabel as labelPrep, type CalendarEntry, type CalendarSession } from '../lib/calendarDays';
import { prepWords } from '../components/calendar/calendarWords';
import { cn, fillTemplate, formatTime, type Lang } from '../lib/utils';
import type { EventStatus } from '../types';

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
  const { campusFilter } = useCampus();
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

  // Every day an event runs, its sessions, and the setup days before it.
  // The calendar is a record of what happened, so archived events stay on it.
  const from = format(range.from, 'yyyy-MM-dd');
  const to = format(range.to, 'yyyy-MM-dd');
  const { data } = useCalendarData(from, to, campusFilter);
  const entriesByDay = useMemo(
    () => buildCalendarDays(data?.events ?? [], data?.sessions ?? [], from, to),
    [data, from, to]
  );
  const open = (entry: CalendarEntry) => navigate(`/events/${entry.event.id}`);

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
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">{t('calendar.title')}</h1>
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
              const dayEntries = entriesByDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  data-calendar-day={key}
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
                    {dayEntries.slice(0, 3).map((entry) => (
                      <button
                        key={entry.key}
                        data-calendar-entry={entry.kind}
                        onClick={(e) => { e.stopPropagation(); open(entry); }}
                        title={entryTitle(entry, t, lang)}
                        className={cn(
                          'flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium',
                          entry.kind === 'prep'
                            ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800'
                            : 'bg-navy-50 text-navy-800 hover:bg-navy-100 dark:bg-navy-900/60 dark:text-navy-100 dark:hover:bg-navy-800'
                        )}
                      >
                        {entry.kind === 'prep' ? (
                          <Wrench className="h-3 w-3 shrink-0" />
                        ) : (
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[entry.event.status])} />
                        )}
                        <span className="truncate">{entry.kind === 'prep' ? `${prepLabel(entry, t)} · ${entry.event.name}` : entry.event.name}</span>
                        {entry.kind === 'event' && entry.dayCount > 1 && (
                          <span className="ml-auto shrink-0 text-[10px] font-semibold opacity-70">{entry.dayIndex}/{entry.dayCount}</span>
                        )}
                      </button>
                    ))}
                    {dayEntries.length > 3 && (
                      <p className="px-1 text-[10px] text-slate-400">+{dayEntries.length - 3}</p>
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
            const dayEntries = entriesByDay.get(key) ?? [];
            return (
              <Card key={key} className={cn('p-3', isToday(day) && 'ring-2 ring-gold-400')}>
                <p className="text-xs font-bold uppercase text-slate-400">{format(day, 'EEE', { locale })}</p>
                <p className={cn('text-lg font-bold', isToday(day) ? 'text-gold-500' : 'text-slate-700 dark:text-slate-200')}>
                  {format(day, 'd')}
                </p>
                <div className="mt-2 space-y-1.5">
                  {dayEntries.map((entry) => (
                    <button
                      key={entry.key}
                      data-calendar-entry={entry.kind}
                      onClick={() => open(entry)}
                      className={cn(
                        'w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium',
                        entry.kind === 'prep'
                          ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800'
                          : 'bg-navy-50 text-navy-800 hover:bg-navy-100 dark:bg-navy-900/60 dark:text-navy-100'
                      )}
                    >
                      {entry.kind === 'prep' ? (
                        <span className="flex items-center gap-1 font-semibold">
                          <Wrench className="h-3 w-3 shrink-0" /> <span className="truncate">{prepLabel(entry, t)}</span>
                        </span>
                      ) : null}
                      <span className="block truncate">{entry.event.name}</span>
                      {entry.kind === 'event' && entry.dayCount > 1 && (
                        <span className="block text-[10px] opacity-70">{fillTemplate(t('calendar.dayOf'), { n: entry.dayIndex, total: entry.dayCount })}</span>
                      )}
                      <SessionLines entry={entry} lang={lang} t={t} compact />
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
          {(entriesByDay.get(format(cursor, 'yyyy-MM-dd')) ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">{t('calendar.noEvents')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(entriesByDay.get(format(cursor, 'yyyy-MM-dd')) ?? []).map((entry) => (
                <li
                  key={entry.key}
                  data-calendar-entry={entry.kind}
                  onClick={() => open(entry)}
                  className={cn(
                    'flex cursor-pointer flex-wrap items-start gap-3 px-2 py-3',
                    entry.kind === 'prep' ? 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  )}
                >
                  <div className="w-16 text-center">
                    <p className={cn('text-sm font-bold', entry.kind === 'prep' ? 'text-amber-700 dark:text-amber-300' : 'text-navy-800 dark:text-gold-300')}>
                      {entry.time ?? '--:--'}
                    </p>
                    {entry.kind === 'event' && entry.dayIndex === entry.dayCount && entry.event.event_finish && (
                      <p className="text-[11px] text-slate-400">{formatTime(entry.event.event_finish, lang)}</p>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {entry.kind === 'prep' && (
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        <Wrench className="h-3.5 w-3.5" /> {prepLabel(entry, t)}
                      </p>
                    )}
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{entry.event.name}</p>
                    <p className="text-xs text-slate-400">
                      {[
                        entry.kind === 'event' && entry.dayCount > 1
                          ? fillTemplate(t('calendar.dayOf'), { n: entry.dayIndex, total: entry.dayCount })
                          : '',
                        entry.event.location ?? ''
                      ].filter(Boolean).join(' · ')}
                    </p>
                    <SessionLines entry={entry} lang={lang} t={t} />
                  </div>
                  <EventStatusBadge status={entry.event.status as EventStatus} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

type Translate = ReturnType<typeof useLanguage>['t'];

/** What a setup or pack-up day says it is: its session's name, or what kind of day it is */
function prepLabel(entry: CalendarEntry, t: Translate): string {
  return labelPrep(entry, prepWords(t));
}

function sessionWhen(session: CalendarSession, lang: Lang): string {
  if (!session.start_time) return '';
  return session.end_time ? `${formatTime(session.start_time, lang)}–${formatTime(session.end_time, lang)}` : formatTime(session.start_time, lang);
}

function entryTitle(entry: CalendarEntry, t: Translate, lang: Lang): string {
  const lines = [entry.kind === 'prep' ? `${prepLabel(entry, t)} · ${entry.event.name}` : entry.event.name];
  for (const session of entry.sessions) {
    lines.push([sessionWhen(session, lang), session.title || t('calendar.session')].filter(Boolean).join(' '));
  }
  return lines.join('\n');
}

/** The sessions of an entry's day, with their times */
function SessionLines({ entry, lang, t, compact }: { entry: CalendarEntry; lang: Lang; t: Translate; compact?: boolean }) {
  const shown = entry.kind === 'prep' && entry.sessions.length <= 1 ? [] : entry.sessions;
  if (shown.length === 0) {
    if (entry.kind === 'prep' && entry.setupTime) {
      return <span className={cn('block opacity-80', compact ? 'text-[10px]' : 'mt-1 text-xs')}>{entry.setupTime}</span>;
    }
    if (entry.kind === 'prep' && entry.sessions[0]) {
      const when = sessionWhen(entry.sessions[0], lang);
      return when ? <span className={cn('block opacity-80', compact ? 'text-[10px]' : 'mt-1 text-xs')}>{when}</span> : null;
    }
    return null;
  }
  return (
    <span className={cn('block space-y-0.5', compact ? 'mt-0.5' : 'mt-1.5')}>
      {shown.map((session) => (
        <span
          key={session.id}
          data-calendar-session={session.id}
          className={cn('flex gap-1.5 opacity-80', compact ? 'text-[10px]' : 'text-xs text-slate-600 dark:text-slate-300')}
        >
          {sessionWhen(session, lang) && <span className="shrink-0 tabular-nums">{sessionWhen(session, lang)}</span>}
          <span className="truncate">{session.title || t('calendar.session')}</span>
        </span>
      ))}
    </span>
  );
}
