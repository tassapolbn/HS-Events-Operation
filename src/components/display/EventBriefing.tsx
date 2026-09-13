import { FloorPlanPreview } from './FloorPlanPreview';
import {
  Clock, DoorOpen, FileText, Flag, Hammer, Map as MapIcon, MapPin, Maximize2,
  PackageCheck, PackageOpen, Paperclip, PlayCircle, StickyNote, type LucideIcon
} from 'lucide-react';
import { showAttachment } from './AttachmentViewer';
import { useLanguage } from '../../i18n';
import { BoardEditableText } from './BoardEditableText';
import { cn, extractDate, formatDate, formatTime, isRichTextEmpty } from '../../lib/utils';
import type { DisplayAttachment, DisplayEvent } from '../../types';

export type BoardStatus = 'upcoming' | 'preparing' | 'live' | 'breakdown' | 'completed';

const at = (value: string | null) => (value ? new Date(value).getTime() : null);

/** Live operational status, derived from the event's own milestones. */
export function boardStatus(event: DisplayEvent, now: number = Date.now()): BoardStatus {
  const setup = at(event.setup_start);
  const start = at(event.event_start);
  const finish = at(event.event_finish);
  const breakdownStart = at(event.breakdown_start);
  const breakdownEnd = at(event.breakdown_deadline);

  if (breakdownEnd && now >= breakdownEnd) return 'completed';
  if (breakdownStart && now >= breakdownStart) return 'breakdown';
  if (finish && now >= finish) return breakdownStart || breakdownEnd ? 'breakdown' : 'completed';
  if (start && now >= start) return 'live';
  if (setup && now >= setup) return 'preparing';
  if (setup || start) return 'upcoming';

  const dayStart = new Date(`${event.event_date}T00:00:00`).getTime();
  if (Number.isNaN(dayStart)) return 'upcoming';
  if (now >= dayStart + 86_400_000) return 'completed';
  if (now >= dayStart) return 'live';
  return 'upcoming';
}

const STATUS_TEXT: Record<BoardStatus, string> = {
  upcoming: 'text-slate-600',
  preparing: 'text-gold-700',
  live: 'text-emerald-700',
  breakdown: 'text-orange-700',
  completed: 'text-slate-500'
};

const STATUS_DOT: Record<BoardStatus, string> = {
  upcoming: 'bg-slate-400',
  preparing: 'bg-gold-500',
  live: 'bg-emerald-500',
  breakdown: 'bg-orange-500',
  completed: 'bg-slate-400'
};

/** Solid light chip so it stays readable on any event header colour. */
export function StatusBadge({ status }: { status: BoardStatus }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-extrabold shadow-sm',
        STATUS_TEXT[status]
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[status], status === 'live' && 'animate-pulse')} />
      {t(`boardStatus.${status}`)}
    </span>
  );
}

/**
 * Open a file on the board itself. Staff never leave the page they are reading,
 * which matters on a wall display or a tablet with no easy way back.
 */
export function openAttachment(file: DisplayAttachment, siblings?: DisplayAttachment[]) {
  showAttachment(file, siblings);
}

export function AttachmentChips({ files }: { files: DisplayAttachment[] }) {
  if (files.length === 0) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <button
          key={file.id}
          onClick={(e) => {
            e.stopPropagation();
            openAttachment(file, files);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <Paperclip className="h-3 w-3" /> {file.file_name}
        </button>
      ))}
    </span>
  );
}

/**
 * A milestone date reads quietly when it falls on the event day, and is
 * highlighted when it does not, so nobody turns up on the wrong day.
 */
function DateChip({ value, eventDate }: { value: string; eventDate: string }) {
  const { lang } = useLanguage();
  const otherDay = extractDate(value) !== eventDate;
  return (
    <span
      className={cn(
        'shrink-0 text-sm font-bold',
        otherDay
          ? 'rounded-md bg-orange-100 px-2 py-0.5 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-800'
          : 'text-slate-500 dark:text-slate-400'
      )}
    >
      {formatDate(value, lang, otherDay ? 'EEE d MMM' : 'd MMM')}
    </span>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
      <Icon className="h-3.5 w-3.5" /> {children}
    </p>
  );
}

/** A milestone carries a clock time, a free text timing note, or both. */
interface Milestone {
  label: string;
  value: string | null;
  note: string;
  field: 'setup_start_note' | 'venue_ready_note' | 'event_start_note' | 'event_finish_note' | 'breakdown_start_note' | 'breakdown_deadline_note';
  icon: LucideIcon;
}

const CARD = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
const TILE = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl';
const LABEL = 'text-[0.7rem] font-extrabold uppercase tracking-[0.12em]';

/**
 * The single place an event states its facts: status, timeline, venue,
 * floor plan, reference and notes. Everything below this is only tasks.
 */
export function EventBriefing({ event }: { event: DisplayEvent }) {
  const { t, lang } = useLanguage();
  const now = Date.now();

  // Lead up only. The closing milestones live at the very bottom of the card,
  // so the last thing staff read is when the event ends and pack down starts.
  const milestones = (
    [
      { label: t('timeline.setupBegins'), value: event.setup_start, note: event.setup_start_note, field: 'setup_start_note', icon: Hammer },
      { label: t('timeline.venueReady'), value: event.venue_ready, note: event.venue_ready_note, field: 'venue_ready_note', icon: DoorOpen },
      { label: t('timeline.eventStarts'), value: event.event_start, note: event.event_start_note, field: 'event_start_note', icon: PlayCircle }
    ] as Milestone[]
  ).filter((m) => Boolean(m.value) || Boolean(m.note));

  const nextIndex = milestones.findIndex((m) => m.value && new Date(m.value).getTime() > now);
  const plans = event.attachments.filter((f) => f.mime_type.startsWith('image/') && !(event.sessions ?? []).some(session => session.floor_plan_attachment_id === f.id));
  const docs = event.attachments.filter((f) => !f.mime_type.startsWith('image/'));

  return (
    <div className="space-y-4">
      {!isRichTextEmpty(event.description) && (
        <BoardEditableText entity="event" id={event.id} eventId={event.id} field="description" value={event.description} label={t('common.description')} rich className="max-w-4xl text-[0.95rem] text-slate-600 dark:text-slate-300" />
      )}

      {/*
        Two columns on wide screens. This keeps the timeline from stretching
        across a TV, which is what pushed each label and its time far apart.
      */}
      <div className={cn('grid gap-4', milestones.length > 0 && 'xl:grid-cols-5')}>
        {/* Timeline: read like a departure board, one row per milestone */}
        {milestones.length > 0 && (
          <section className="xl:col-span-3">
            <SectionLabel icon={Clock}>{t('events.timeline')}</SectionLabel>
          <ol className={cn('overflow-hidden', CARD)}>
            {milestones.map((m, i) => {
              const Icon = m.icon;
              const isNext = i === nextIndex;
              const isPast = Boolean(m.value) && new Date(m.value as string).getTime() <= now;
              return (
                <li
                  key={m.label}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-3 first:border-t-0 dark:border-slate-800',
                    isNext && 'bg-gold-50 dark:bg-gold-950/30',
                    !isNext && isPast && 'bg-slate-50/70 dark:bg-slate-800/40'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      isNext ? 'bg-gold-400 text-navy-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-[8rem] flex-1">
                    <span
                      className={cn(
                        'block truncate text-[0.75rem] font-extrabold uppercase tracking-[0.1em]',
                        isNext ? 'text-gold-800 dark:text-gold-300' : 'text-slate-600 dark:text-slate-300'
                      )}
                    >
                      {m.label}
                    </span>
                    {/* Free text timing, e.g. "after school time" */}
                    {m.note && (
                      <span className="mt-0.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">
                        <BoardEditableText entity="event" id={event.id} eventId={event.id} field={m.field} value={m.note} label={m.label} />
                      </span>
                    )}
                  </span>
                  {/* Date and time stay together, wrapping as one unit on narrow screens */}
                  {m.value && (
                    <span className="ml-auto flex shrink-0 items-center gap-3">
                      <DateChip value={m.value} eventDate={event.event_date} />
                      <span
                        className={cn(
                          'w-[4.75rem] text-right text-xl font-black tabular-nums',
                          isNext ? 'text-gold-900 dark:text-gold-200' : 'text-slate-900 dark:text-slate-100'
                        )}
                      >
                        {formatTime(m.value, lang)}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Venue, floor plan and reference: stated once for the whole event */}
      <div
        className={cn(
          'grid content-start gap-3 sm:grid-cols-2',
          milestones.length > 0 ? 'xl:col-span-2 xl:grid-cols-1' : 'xl:grid-cols-3'
        )}
      >
        <div className={cn('flex items-center gap-3 px-4 py-3.5', CARD)}>
          <span className={cn(TILE, 'bg-navy-50 text-navy-700 dark:bg-navy-900/60 dark:text-navy-200')}>
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className={cn(LABEL, 'text-slate-400')}>{t('common.location')}</p>
            <p className="truncate text-lg font-extrabold text-slate-900 dark:text-slate-100"><BoardEditableText entity="event" id={event.id} eventId={event.id} field="location" value={event.location} label={t('common.location')} /></p>
          </div>
        </div>

        {plans.length > 0 && (
          <button
            onClick={() => openAttachment(plans[0], plans)}
            className="group flex items-center gap-3 rounded-2xl border-2 border-gold-400 bg-gold-50 px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-100 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 dark:border-gold-600 dark:bg-gold-950/40"
          >
            <span className={cn(TILE, 'bg-gold-400 text-navy-900')}>
              <MapIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn(LABEL, 'text-gold-700 dark:text-gold-400')}>
                {t('display.floorPlan')}
                {plans.length > 1 && ` (${plans.length})`}
              </p>
              <p className="truncate text-lg font-extrabold text-gold-900 dark:text-gold-200">{t('display.viewFloorPlan')}</p>
            </div>
            <Maximize2 className="h-5 w-5 shrink-0 text-gold-600 transition-transform duration-200 group-hover:scale-110" />
          </button>
        )}

        {docs.length > 0 && (
          <div className={cn('px-4 py-3.5', CARD)}>
            <p className={cn(LABEL, 'flex items-center gap-1.5 text-slate-400')}>
              <FileText className="h-3.5 w-3.5" /> {t('display.reference')}
            </p>
            <AttachmentChips files={docs} />
          </div>
        )}
        </div>
      </div>

      {plans.map(file => <FloorPlanPreview key={file.id} file={file} />)}

      {/* Notes sit on a neutral card with a single amber accent, not a full colour wash */}
      {!isRichTextEmpty(event.additional_notes) && (
        <div className={cn('flex items-start gap-3 px-4 py-3.5', CARD, 'border-l-4 border-l-amber-400')}>
          <StickyNote className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className={cn(LABEL, 'text-slate-500 dark:text-slate-400')}>{t('events.additionalNotes')}</p>
            <BoardEditableText entity="event" id={event.id} eventId={event.id} field="additional_notes" value={event.additional_notes} label={t('events.additionalNotes')} rich
              className="mt-1 text-[0.95rem] text-slate-700 dark:text-slate-200"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The closing milestones, pinned to the bottom of the event card on one line.
 * This is the last thing staff read: when the event finishes and when pack
 * down starts and must be complete.
 */
export function EventClosingBar({ event }: { event: DisplayEvent }) {
  const { t, lang } = useLanguage();

  const items = (
    [
      { label: t('timeline.eventEnds'), value: event.event_finish, note: event.event_finish_note, field: 'event_finish_note', icon: Flag },
      { label: t('timeline.breakdownBegins'), value: event.breakdown_start, note: event.breakdown_start_note, field: 'breakdown_start_note', icon: PackageOpen },
      {
        label: t('timeline.breakdownComplete'),
        value: event.breakdown_deadline,
        note: event.breakdown_deadline_note, field: 'breakdown_deadline_note',
        icon: PackageCheck
      }
    ] as Milestone[]
  ).filter((m) => Boolean(m.value) || Boolean(m.note));

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-5 grid gap-2 rounded-2xl border-2 border-navy-200 bg-navy-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60',
        items.length === 1 ? 'sm:grid-cols-1' : items.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
      )}
    >
      {items.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.label}
            className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-slate-900"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-100 text-navy-700 dark:bg-slate-800 dark:text-slate-300">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.7rem] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                {m.label}
              </p>
              {m.value && (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-slate-900 dark:text-slate-100">
                  <DateChip value={m.value} eventDate={event.event_date} />
                  <span className="text-lg font-black tabular-nums">{formatTime(m.value, lang)}</span>
                </p>
              )}
              {/* Free text timing, e.g. "anytime on that day" */}
              {m.note && (
                <p className="truncate text-sm font-semibold text-slate-600 dark:text-slate-300"><BoardEditableText entity="event" id={event.id} eventId={event.id} field={m.field} value={m.note} label={m.label} /></p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
