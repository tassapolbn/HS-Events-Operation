/**
 * The calendar subscription links: /calendar/hsc.ics and /calendar/hsn.ics.
 *
 * Google Calendar, Apple Calendar and Outlook fetch these every few hours.
 * The link's key is checked by the database (calendar_feed), which answers
 * with the campus's events; src/lib/icsFeed.ts turns them into the calendar
 * file. Netlify keeps each answer for an hour, so however many people and
 * devices subscribe, the database is asked at most about once an hour per
 * link.
 *
 * It uses the site's own VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * settings, which Netlify makes available to functions.
 */

import { buildIcsFeed, type FeedEvent } from '../../src/lib/icsFeed.ts';

declare const Netlify: { env: { get(name: string): string | undefined } };

const CAMPUSES: Record<string, { code: 'HSC' | 'HSN'; name: string }> = {
  '/calendar/hsc.ics': { code: 'HSC', name: 'Chaofah City Campus' },
  '/calendar/hsn.ics': { code: 'HSN', name: 'Cherngtalay North Campus' }
};

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const campus = CAMPUSES[url.pathname.toLowerCase()];
  const key = url.searchParams.get('key') ?? '';
  const lang = url.searchParams.get('lang') === 'th' ? 'th' : 'en';
  // Keys are 32 hex characters; anything else is not worth asking the database about
  if (!campus || !/^[0-9a-f]{32}$/.test(key)) return text('Not found', 404);

  const supabaseUrl = Netlify.env.get('VITE_SUPABASE_URL');
  const anonKey = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    console.error('calendar-feed: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing');
    return text('The calendar is not set up', 500);
  }

  let events: FeedEvent[] | null;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/calendar_feed`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_campus: campus.code })
    });
    if (!response.ok) {
      console.error(`calendar-feed: Supabase answered ${response.status}`);
      return text('The calendar is not available right now', 502);
    }
    events = (await response.json()) as FeedEvent[] | null;
  } catch (error) {
    console.error('calendar-feed: could not reach Supabase', error);
    return text('The calendar is not available right now', 502);
  }
  // A key that has been replaced, or never existed
  if (!Array.isArray(events)) return text('Not found', 404);

  const body = buildIcsFeed({ events, campus: campus.code, campusName: campus.name, lang, siteUrl: url.origin, now: new Date() });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="headstart-${campus.code.toLowerCase()}.ics"`,
      // Netlify keeps the answer for an hour and may hand out the old one for
      // ten more minutes while it fetches a new one
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=600',
      'Netlify-Vary': 'query=key|lang',
      'Cache-Control': 'public, max-age=900'
    }
  });
};

export const config = {
  path: ['/calendar/hsc.ics', '/calendar/hsn.ics']
};
