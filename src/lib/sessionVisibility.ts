import type { DisplaySession } from '../types';

/** A session without a finish time remains current until midnight in Bangkok. */
export function sessionHasEnded(session: Pick<DisplaySession, 'session_date' | 'end_time'>, now = Date.now()) {
  if (session.end_time) {
    const end = Date.parse(session.end_time);
    if (Number.isFinite(end)) return end <= now;
  }
  const nextDay = Date.parse(`${session.session_date}T00:00:00+07:00`) + 86_400_000;
  return Number.isFinite(nextDay) && nextDay <= now;
}
