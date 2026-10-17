/**
 * The calendar subscription links for each campus, as the app shows them.
 * The Netlify function at the same paths serves the calendars themselves.
 */

export type FeedCampus = 'HSC' | 'HSN';

export const FEED_CAMPUSES: FeedCampus[] = ['HSC', 'HSN'];

/** e.g. https://hs-opt.netlify.app/calendar/hsc.ics?key=…&lang=th */
export function calendarFeedUrl(origin: string, campus: FeedCampus, key: string, lang: 'en' | 'th'): string {
  const url = new URL(`/calendar/${campus.toLowerCase()}.ics`, origin);
  url.searchParams.set('key', key);
  if (lang === 'th') url.searchParams.set('lang', 'th');
  return url.toString();
}

/** The same link for calendar apps that open webcal: links (Apple Calendar, Outlook) */
export function webcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:/, 'webcal:');
}

/** Opens Google Calendar's "add this calendar" step for the link */
export function googleCalendarAddUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;
}
