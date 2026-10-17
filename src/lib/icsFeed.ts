/**
 * A campus's events as a calendar file (iCalendar, RFC 5545) that Google
 * Calendar, Apple Calendar and Outlook can subscribe to.
 *
 * - Each event is one all-day entry across its own days.
 * - Each session is its own entry: at its time when it has one, otherwise as
 *   an all-day entry on its day. A setup session before the event says so.
 * - "Setup begins", on a day before the event that has no session, is an
 *   entry of its own too, as on the app's calendar.
 *
 * Times are written in UTC, so every calendar app shows them in its own time
 * zone. No React or Supabase here: the Netlify function and the tests both
 * use it as it is.
 */

import { eventDayCount, eventDayIndex, eventEndDate, isMultiDay, shiftDay } from './eventDays.ts';

export type FeedLang = 'en' | 'th';

export interface FeedContact {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
}

export interface FeedSession {
  id: string;
  title: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location?: string | null;
  time_note?: string | null;
  note?: string | null;
  updated_at?: string | null;
}

export interface FeedEvent {
  id: string;
  name: string;
  campus: string;
  status?: string;
  event_date: string;
  end_date?: string | null;
  location?: string | null;
  setup_start?: string | null;
  event_start?: string | null;
  event_finish?: string | null;
  updated_at?: string | null;
  contacts?: FeedContact[] | null;
  sessions?: FeedSession[] | null;
}

export interface FeedOptions {
  events: FeedEvent[];
  /** 'HSC' or 'HSN' */
  campus: string;
  /** The campus's full name, for the calendar's title */
  campusName: string;
  lang: FeedLang;
  /** Where the app lives, e.g. https://hs-opt.netlify.app */
  siteUrl: string;
  now: Date;
}

const WORDS = {
  en: {
    calName: 'HeadStart Events · {campus}',
    calDesc: 'Events and sessions from the HeadStart Event Operations app. Changes made in the app show here after the calendar refreshes.',
    session: 'Session',
    prep: 'Preparation',
    until: 'Until {time}',
    dayOf: 'Day {n} of {total}',
    before: 'Before the event · the event starts {date}',
    after: 'After the event',
    setupBegins: 'Setup begins',
    eventStarts: 'Event starts',
    eventFinishes: 'Event finishes',
    sessions: 'Sessions',
    contacts: 'Contacts',
    note: 'Note',
    board: 'Open on the board'
  },
  th: {
    calName: 'งานอีเวนท์ HeadStart · {campus}',
    calDesc: 'งานและเซสชันจากระบบ HeadStart Event Operations ถ้ามีการแก้ไขในระบบ ปฏิทินจะอัปเดตตามเมื่อรีเฟรช',
    session: 'เซสชัน',
    prep: 'เตรียมงาน',
    until: 'ถึง {time}',
    dayOf: 'วันที่ {n} จาก {total}',
    before: 'ก่อนวันงาน · งานเริ่ม {date}',
    after: 'หลังจบงาน',
    setupBegins: 'เริ่มเซตอัพ',
    eventStarts: 'งานเริ่ม',
    eventFinishes: 'งานจบ',
    sessions: 'เซสชัน',
    contacts: 'ผู้ติดต่อ',
    note: 'หมายเหตุ',
    board: 'ดูบนบอร์ด'
  }
} as const;

type Words = { [K in keyof (typeof WORDS)['en']]: string };

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

// ---------- iCalendar text ----------

/** Text as an iCalendar TEXT value: backslash, semicolon, comma and line breaks escaped */
export function icsEscape(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    // Other control characters are not allowed in a TEXT value
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * A content line folded at 75 bytes, as RFC 5545 asks. The split never falls
 * inside a character, so Thai text survives intact.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = char;
      bytes = size;
      // A continuation line starts with a space, which counts towards its 75
      limit = 74;
    } else {
      current += char;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** A yyyy-MM-dd day as an iCalendar DATE */
export function icsDate(day: string): string {
  return day.replace(/-/g, '');
}

/** A timestamp as an iCalendar UTC DATE-TIME, or null when it is not a time */
export function icsDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// ---------- dates in words ----------

function dayFormat(lang: FeedLang, withYear: boolean) {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC'
  });
}

function sayDay(day: string, lang: FeedLang, withYear = false): string {
  // en-GB puts a comma after the weekday when the year is shown: "Fri, 23 Oct 2026"
  return dayFormat(lang, withYear).format(new Date(`${day}T00:00:00Z`)).replace(/,/g, '');
}

function sayTime(value: string, lang: FeedLang): string {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Bangkok'
  }).format(new Date(value));
}

function sayDayTime(value: string, lang: FeedLang): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(value));
  return `${sayDay(day, lang)} ${sayTime(value, lang)}`;
}

function sayRange(event: FeedEvent, lang: FeedLang): string {
  const last = eventEndDate(event);
  if (last === event.event_date) return sayDay(event.event_date, lang, true);
  return `${sayDay(event.event_date, lang)} – ${sayDay(last, lang, true)}`;
}

function saySessionTime(session: FeedSession, lang: FeedLang): string {
  if (!session.start_time) return '';
  const ends = session.end_time && Date.parse(session.end_time) > Date.parse(session.start_time);
  return ends
    ? `${sayTime(session.start_time, lang)}–${sayTime(session.end_time as string, lang)}`
    : sayTime(session.start_time, lang);
}

/**
 * What a session's entry is called. A named session leads with its name, as on
 * the app's calendar ("Setup · Wai Kru"). An unnamed one says what kind of day
 * it is, or is simply the event on the event's own days.
 */
function sessionSummary(event: FeedEvent, session: FeedSession, words: Words): string {
  const title = session.title?.trim();
  if (title) return `${title} · ${event.name}`;
  if (session.session_date < event.event_date) return `${words.prep} · ${event.name}`;
  if (isMultiDay(event) && session.session_date > eventEndDate(event)) return `${words.after} · ${event.name}`;
  return event.name;
}

/** Where a session's day sits in its event, or nothing when that is unclear */
function sessionDayLabel(event: FeedEvent, day: string, words: Words, lang: FeedLang): string {
  if (day < event.event_date) return fill(words.before, { date: sayDay(event.event_date, lang) });
  if (!isMultiDay(event)) return '';
  if (day > eventEndDate(event)) return words.after;
  return fill(words.dayOf, { n: eventDayIndex(event, day), total: eventDayCount(event) });
}

function contactLine(contact: FeedContact): string {
  const name = (contact.name ?? '').trim();
  const role = (contact.role ?? '').trim();
  return [role ? `${name} (${role})` : name, contact.phone?.trim(), contact.email?.trim()].filter(Boolean).join(' · ');
}

// ---------- the calendar ----------

/** One calendar entry, before it is written out */
export interface FeedEntry {
  uid: string;
  summary: string;
  /** All-day: first day and the day after the last; timed: start and an optional end */
  allDay?: { first: string; afterLast: string };
  timed?: { start: string; end: string | null };
  location?: string;
  description: string[];
  url: string;
  modified?: string | null;
}

function entryLines(entry: FeedEntry, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${entry.uid}`, `DTSTAMP:${stamp}`];
  if (entry.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(entry.allDay.first)}`, `DTEND;VALUE=DATE:${icsDate(entry.allDay.afterLast)}`);
    // An all-day entry should not make anyone look busy
    lines.push('TRANSP:TRANSPARENT');
  } else if (entry.timed) {
    lines.push(`DTSTART:${entry.timed.start}`);
    if (entry.timed.end) lines.push(`DTEND:${entry.timed.end}`);
  }
  lines.push(`SUMMARY:${icsEscape(entry.summary)}`);
  if (entry.location) lines.push(`LOCATION:${icsEscape(entry.location)}`);
  const description = entry.description.filter(Boolean).join('\n');
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  lines.push(`URL:${entry.url}`);
  const modified = icsDateTime(entry.modified);
  if (modified) lines.push(`LAST-MODIFIED:${modified}`);
  lines.push('END:VEVENT');
  return lines;
}

/** The entries one event puts on the calendar */
export function eventEntries(event: FeedEvent, options: Omit<FeedOptions, 'events' | 'now'>): FeedEntry[] {
  const words = WORDS[options.lang];
  const lang = options.lang;
  const board = `${options.siteUrl.replace(/\/$/, '')}/display/${options.campus.toLowerCase()}?event=${event.id}`;
  const sessions = [...(event.sessions ?? [])].sort(
    (a, b) => a.session_date.localeCompare(b.session_date) || (a.start_time ?? '~').localeCompare(b.start_time ?? '~')
  );
  const contacts = (event.contacts ?? []).filter((contact) => (contact.name ?? '').trim()).map(contactLine);
  const entries: FeedEntry[] = [];

  // The event itself, across its days
  entries.push({
    uid: `event-${event.id}@hs-event-ops`,
    summary: event.name,
    allDay: { first: event.event_date, afterLast: shiftDay(eventEndDate(event), 1) },
    location: event.location?.trim() || undefined,
    description: [
      sayRange(event, lang),
      event.event_start ? `${words.eventStarts}: ${sayDayTime(event.event_start, lang)}` : '',
      event.event_finish ? `${words.eventFinishes}: ${sayDayTime(event.event_finish, lang)}` : '',
      sessions.length
        ? `\n${words.sessions}:\n${sessions
            .map((session) =>
              ['•', sayDay(session.session_date, lang), saySessionTime(session, lang), session.title?.trim() || words.session]
                .filter(Boolean)
                .join(' ')
            )
            .join('\n')}`
        : '',
      contacts.length ? `\n${words.contacts}:\n${contacts.map((line) => `• ${line}`).join('\n')}` : '',
      `\n${words.board}: ${board}`
    ],
    url: board,
    modified: event.updated_at
  });

  // Each session on its own
  for (const session of sessions) {
    const start = icsDateTime(session.start_time);
    const endRaw = icsDateTime(session.end_time);
    const end = start && endRaw && endRaw > start ? endRaw : null;
    entries.push({
      uid: `session-${session.id}@hs-event-ops`,
      summary: sessionSummary(event, session, words),
      ...(start
        ? { timed: { start, end } }
        : { allDay: { first: session.session_date, afterLast: shiftDay(session.session_date, 1) } }),
      location: session.location?.trim() || event.location?.trim() || undefined,
      description: [
        sessionDayLabel(event, session.session_date, words, lang),
        // Only a finish time: say so, since the entry itself is all day
        !start && session.end_time ? fill(words.until, { time: sayTime(session.end_time, lang) }) : '',
        session.time_note?.trim() ?? '',
        session.note?.trim() ? `${words.note}: ${session.note.trim()}` : '',
        `\n${words.board}: ${board}`
      ],
      url: board,
      modified: session.updated_at ?? event.updated_at
    });
  }

  // "Setup begins" on an earlier day that has no session of its own
  const setup = icsDateTime(event.setup_start);
  if (setup && event.setup_start) {
    const setupDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(event.setup_start));
    if (setupDay < event.event_date && !sessions.some((session) => session.session_date === setupDay)) {
      entries.push({
        uid: `setup-${event.id}@hs-event-ops`,
        summary: `${event.name} · ${words.setupBegins}`,
        timed: { start: setup, end: null },
        location: event.location?.trim() || undefined,
        description: [fill(words.before, { date: sayDay(event.event_date, lang) }), `\n${words.board}: ${board}`],
        url: board,
        modified: event.updated_at
      });
    }
  }
  return entries;
}

/** The whole calendar file, with CRLF line endings and folded lines */
export function buildIcsFeed(options: FeedOptions): string {
  const words = WORDS[options.lang];
  const stamp = icsDateTime(options.now) as string;
  const name = fill(words.calName, { campus: options.campusName });
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HeadStart International School Phuket//Event Operations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    `NAME:${icsEscape(name)}`,
    `X-WR-CALDESC:${icsEscape(words.calDesc)}`,
    'X-WR-TIMEZONE:Asia/Bangkok',
    // Hints for apps that respect them; Google decides on its own
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H'
  ];
  const events = [...options.events].sort((a, b) => a.event_date.localeCompare(b.event_date) || a.name.localeCompare(b.name));
  for (const event of events) {
    for (const entry of eventEntries(event, options)) lines.push(...entryLines(entry, stamp));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
