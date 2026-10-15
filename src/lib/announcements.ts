/**
 * When an announcement shows, and in what order.
 *
 * An announcement has a first day and, usually, a last day. Outside those days
 * it is simply not shown, so nobody has to remember to take an old notice
 * down. Days are Bangkok days, the same as the database uses. No React or
 * Supabase in here, so the rules can be tested on their own.
 */

export type AnnouncementTone = 'info' | 'warning' | 'urgent';

export interface Announcement {
  id: string;
  message: string;
  tone: AnnouncementTone;
  /** yyyy-MM-dd */
  starts_on: string;
  /** yyyy-MM-dd, or null to show until removed */
  ends_on: string | null;
  show_on_board: boolean;
  /** null means both campuses */
  campus: 'HSC' | 'HSN' | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const TONES: AnnouncementTone[] = ['info', 'warning', 'urgent'];

/** Today in Bangkok as yyyy-MM-dd */
export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
}

/** A yyyy-MM-dd date moved by a number of days */
export function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

export type AnnouncementState = 'upcoming' | 'active' | 'ended';

export function announcementState(item: Pick<Announcement, 'starts_on' | 'ends_on'>, today: string): AnnouncementState {
  if (item.starts_on > today) return 'upcoming';
  if (item.ends_on && item.ends_on < today) return 'ended';
  return 'active';
}

const TONE_ORDER: Record<AnnouncementTone, number> = { urgent: 0, warning: 1, info: 2 };

/** Most urgent first, then the newest */
export function sortAnnouncements<T extends Pick<Announcement, 'tone' | 'starts_on' | 'created_at'>>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (TONE_ORDER[a.tone] ?? 3) - (TONE_ORDER[b.tone] ?? 3) ||
      b.starts_on.localeCompare(a.starts_on) ||
      b.created_at.localeCompare(a.created_at)
  );
}

/**
 * What the Dashboard shows today for the chosen campus: every campus when
 * nothing is chosen, otherwise that campus and the notices for both.
 */
export function dashboardAnnouncements(items: Announcement[], today: string, campus?: 'HSC' | 'HSN'): Announcement[] {
  return sortAnnouncements(
    items.filter(
      (item) => announcementState(item, today) === 'active' && (!campus || !item.campus || item.campus === campus)
    )
  );
}

/** A dismissed notice stays hidden on this device until somebody edits it */
export function dismissKey(item: Pick<Announcement, 'id' | 'updated_at'>): string {
  return `${item.id}@${item.updated_at}`;
}
