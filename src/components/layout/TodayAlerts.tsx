import { useEffect, useMemo, useState } from 'react';
import { useCalendarData } from '../../hooks/useCalendar';
import { useCampus } from '../../contexts/CampusContext';
import { DayAlertBar } from '../calendar/DayAlertBar';
import { alertsSignature, todayTomorrowAlerts } from '../../lib/calendarDays';
import { schoolToday } from '../../lib/archive';
import { shiftDay } from '../../lib/eventDays';

const HIDDEN_KEY = 'eventops.hidden-day-alerts';

function readHidden(): string {
  try {
    return localStorage.getItem(HIDDEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeHidden(signature: string) {
  try {
    localStorage.setItem(HIDDEN_KEY, signature);
  } catch {
    // Storage can be blocked; the bar then simply comes back on the next visit
  }
}

/**
 * What is on today and tomorrow, under the top bar on every page, for the
 * campus chosen in the header. Hiding it lasts until tomorrow or until
 * something new is added for these two days.
 */
export function TodayAlerts() {
  const { campusFilter } = useCampus();
  // Re-read the date every minute, so the bar moves on at midnight
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = schoolToday(now);
  const { data } = useCalendarData(today, shiftDay(today, 1), campusFilter);
  const alerts = useMemo(
    () => todayTomorrowAlerts(data?.events ?? [], data?.sessions ?? [], today),
    [data, today]
  );
  const [hidden, setHidden] = useState(readHidden);
  const signature = alertsSignature(today, alerts);

  if (alerts.length === 0 || hidden === signature) return null;
  return (
    <DayAlertBar
      alerts={alerts}
      linkFor={(entry) => `/events/${entry.event.id}`}
      moreHref="/calendar"
      onHide={() => {
        setHidden(signature);
        writeHidden(signature);
      }}
    />
  );
}
